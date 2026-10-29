import { POST } from '@/app/api/cloned-voices/[voiceId]/samples/route'

jest.mock('@/lib/api-access', () => ({ denyUnlessMutableApiAuthorized: jest.fn(() => null) }))
jest.mock('@/lib/rate-limit', () => ({
  cloneRateLimiter: { limit: jest.fn(async () => ({ success: true, limit: 5, remaining: 4, reset: Date.now() + 60000 })) },
}))
jest.mock('@/lib/config', () => ({
  config: { isRailway: false, xttsConfigured: true, services: { xtts: { url: 'http://voice:8081' } } },
}))

function makeRequest(files: File[]) {
  const form = new FormData()
  for (const f of files) form.append('files', f)
  return { formData: async () => form, headers: new Headers() } as never
}

const wav = () => new File([new Uint8Array(4096)], 'take.wav', { type: 'audio/wav' })

describe('POST /api/cloned-voices/[voiceId]/samples', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  it('rejects non-clone voice ids', async () => {
    const res = await POST(makeRequest([wav()]), { params: Promise.resolve({ voiceId: 'female_english' }) })
    expect(res.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('forwards takes to the voice service and relays its answer', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, samples_count: 3, reference_seconds: 64 }),
    })
    const res = await POST(makeRequest([wav(), wav()]), { params: Promise.resolve({ voiceId: 'clone_me_abc123' }) })
    expect(res.status).toBe(200)
    expect((await res.json()).samples_count).toBe(3)
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('http://voice:8081/voices/clone_me_abc123/samples')
    expect((init.body as FormData).getAll('files')).toHaveLength(2)
  })

  it('relays voice service validation errors', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'A voice can hold at most 8 takes (8 already stored)' }),
    })
    const res = await POST(makeRequest([wav()]), { params: Promise.resolve({ voiceId: 'clone_me_abc123' }) })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('at most 8 takes')
  })
})
