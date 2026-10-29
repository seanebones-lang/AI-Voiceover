import { POST } from '@/app/api/tts/route'

jest.mock('@/lib/api-access', () => ({
  denyUnlessMutableApiAuthorized: jest.fn(() => null),
}))

jest.mock('@/lib/rate-limit', () => ({
  ttsRateLimiter: {
    limit: jest.fn(async () => ({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60000,
    })),
  },
}))

jest.mock('@/lib/config', () => ({
  config: {
    services: {
      xtts: {
        url: 'http://xtts-service:8081',
        timeout: 30000,
        retries: 2,
      },
    },
    isRailway: false,
  },
  withRetry: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}))

jest.mock('@/lib/validation', () => ({
  validateTTSRequest: jest.fn((body: Record<string, unknown>) => ({ success: true, data: body })),
  extractClientIP: jest.fn(() => '127.0.0.1'),
  CLONED_TTS_MAX_CHARS: 2200,
}))

jest.mock('@/lib/monitoring', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateRequestId: jest.fn(() => 'req_test_1'),
  recordMetric: jest.fn(),
  recordCloneMetric: jest.fn(),
}))

jest.mock('@/lib/tts-cache', () => ({
  buildTtsCacheKey: jest.fn(() => 'cache-key'),
  getCached: jest.fn(() => null),
  setCached: jest.fn(),
}))

jest.mock('@/lib/tts/emotion-prosody', () => ({
  applyEmotionProsody: jest.fn((base: Record<string, unknown>) => base),
  applyExpressiveCopyProsody: jest.fn((base: Record<string, unknown>) => base),
}))


function makeRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'x-request-id' ? 'test-request-id' : null),
    },
  } as any
}

describe('POST /api/tts options matrix', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  it('routes stock voices to the local voice service (no third-party API)', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-type' ? 'audio/mpeg' : name.toLowerCase() === 'x-engine' ? 'kokoro' : null,
      },
      arrayBuffer: async () => new Uint8Array([9, 9, 9]).buffer,
    })

    const response = await POST(
      makeRequest({
        text: 'hello world',
        voice_id: 'default_english',
        language: 'en',
        speed: 1,
        pitch: 0,
        volume: 1,
        reverb: 0,
        echo: 0,
        noise_reduction: false,
        special_effect: 'none',
        emotion: 'neutral',
        output_format: 'mp3',
        temperature: 0.9,
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Voice-Type')).toBe('standard')
    expect(response.headers.get('X-Voice-Engine')).toBe('kokoro')
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg')
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('http://xtts-service:8081/tts')
    const requestBody = JSON.parse(init.body as string)
    expect(requestBody.voice_id).toBe('default_english')
    expect(requestBody.output_format).toBe('mp3')
    // XTTS sampling params are never sent for Kokoro voices.
    expect(requestBody.temperature).toBeUndefined()
  })

  it('returns 503 with a retry hint while the voice engine is loading', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ detail: 'XTTS model is loading. Please retry in 20-60 seconds.' }),
    })

    const response = await POST(makeRequest({ text: 'hi', voice_id: 'clone_demo_123456', language: 'en' }))
    const data = await response.json()
    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('15')
    expect(data.details).toContain('loading')
  })

  it('keeps pause markers and IPA markup for the voice service to render', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'audio/wav' },
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    })

    await POST(
      makeRequest({
        text: 'Say [ipa:tomato|təˈmɑːtoʊ] [pause:long] then NextEleven.\n\nNew paragraph.',
        voice_id: 'female_english',
        language: 'en',
        pronunciation_overrides: { NextEleven: 'Next Eleven' },
      })
    )
    const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string)
    expect(requestBody.text).toBe('Say [ipa:tomato|təˈmɑːtoʊ] [pause:long] then Next Eleven.\n\nNew paragraph.')
    expect(requestBody.pronunciation_overrides).toBeUndefined()
  })

  it('forwards clone controls including pitch and advanced XTTS params', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'audio/wav' : null) },
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    })

    const response = await POST(
      makeRequest({
        text: 'clone test',
        voice_id: 'clone_demo_123456',
        language: 'en',
        speed: 0.95,
        pitch: 4,
        volume: 0.9,
        reverb: 0.2,
        echo: 0.1,
        noise_reduction: true,
        special_effect: 'none',
        emotion: 'neutral',
        clone_preset: 'expressive',
        auto_expressive: true,
        expressive_intensity: 'balanced',
        mastering_enabled: true,
        mastering_profile: 'podcast',
        pronunciation_overrides: { Nexteleven: 'Next Eleven' },
        temperature: 0.72,
        repetition_penalty: 1.52,
        top_k: 60,
        top_p: 0.93,
      })
    )

    expect(response.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const requestBody = JSON.parse(init.body as string)
    expect(requestBody.pitch).toBe(4)
    expect(requestBody.clone_preset).toBe('expressive')
    expect(requestBody.mastering_enabled).toBe(true)
    expect(requestBody.mastering_profile).toBe('podcast')
    expect(requestBody.pronunciation_overrides).toBeUndefined()
    expect(requestBody.temperature).toBe(0.72)
    expect(requestBody.repetition_penalty).toBe(1.52)
    expect(requestBody.top_k).toBe(60)
    expect(requestBody.top_p).toBe(0.93)
  })
})

