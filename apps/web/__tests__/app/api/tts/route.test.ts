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

jest.mock('@/lib/edgeTtsService', () => ({
  synthesizeEdge: jest.fn(async () => Buffer.from('edge-mp3')),
  isEdgeVoice: jest.fn((voiceId: string) => voiceId === 'default_english'),
}))

jest.mock('@/lib/edgeTtsFallback', () => ({
  synthesizeEdgeTts: jest.fn(async () => Buffer.from('fallback-mp3')),
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

  it('routes standard voice to edge websocket path', async () => {
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
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Voice-Type')).toBe('edge-tts-websocket')
    expect(global.fetch).not.toHaveBeenCalled()
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
    expect(requestBody.auto_expressive).toBe(true)
    expect(requestBody.expressive_intensity).toBe('balanced')
    expect(requestBody.mastering_enabled).toBe(true)
    expect(requestBody.mastering_profile).toBe('podcast')
    expect(requestBody.pronunciation_overrides).toEqual({ Nexteleven: 'Next Eleven' })
    expect(requestBody.temperature).toBe(0.72)
    expect(requestBody.repetition_penalty).toBe(1.52)
    expect(requestBody.top_k).toBe(60)
    expect(requestBody.top_p).toBe(0.93)
  })
})

