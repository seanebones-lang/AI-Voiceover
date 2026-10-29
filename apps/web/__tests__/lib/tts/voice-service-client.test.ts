import { synthesizeWithVoiceService, voiceServiceTimeoutMs } from '@/lib/tts/voice-service-client'

jest.mock('@/lib/config', () => ({
  config: { services: { xtts: { url: 'http://voice:8081', timeout: 30000, retries: 2 } } },
  withRetry: jest.fn(async (fn: () => Promise<unknown>, retries: number) => {
    let last: unknown
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn()
      } catch (e) {
        last = e
      }
    }
    throw last
  }),
}))

const basePayload = {
  text: 'Hello',
  language: 'en',
  speed: 1,
  pitch: 0,
  volume: 1,
  reverb: 0,
  echo: 0,
  noise_reduction: false,
  special_effect: 'none',
}

describe('voice service client', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  it('gives XTTS voices a long budget and Kokoro voices a short one', () => {
    expect(voiceServiceTimeoutMs('clone_x', 2000, false)).toBeGreaterThan(200_000)
    expect(voiceServiceTimeoutMs('female_english', 200, false)).toBeLessThanOrEqual(30_000)
    expect(voiceServiceTimeoutMs('clone_x', 10_000, true)).toBeLessThanOrEqual(270_000)
  })

  it('never retries XTTS synthesis but retries a fast stock voice once', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValue(new TypeError('fetch failed'))
    await expect(
      synthesizeWithVoiceService({ ...basePayload, voice_id: 'clone_x' }, 'r1', { timeoutMs: 1000 })
    ).rejects.toThrow('fetch failed')
    expect(global.fetch).toHaveBeenCalledTimes(1)
    ;(global.fetch as jest.Mock).mockClear()
    await expect(
      synthesizeWithVoiceService({ ...basePayload, voice_id: 'female_english' }, 'r2', { timeoutMs: 1000 })
    ).rejects.toThrow('fetch failed')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('surfaces the service error detail', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Unknown voice: nope' }),
    })
    const out = await synthesizeWithVoiceService({ ...basePayload, voice_id: 'nope' }, 'r3', { timeoutMs: 1000 })
    expect(out).toEqual({ ok: false, status: 404, detail: 'Unknown voice: nope' })
  })
})
