import { GET } from '@/app/api/voices/route'

// Mock the TTS service
global.fetch = jest.fn()

describe('GET /api/voices', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should include cloned voices from service response', async () => {
    const clonedVoices = [
      { voice_id: 'voice-1', name: 'Voice One' },
      { voice_id: 'voice-2', name: 'Voice Two' },
    ]

    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ voices: clonedVoices }),
    })

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.degraded).toBeUndefined()
    expect(data.cloned_count).toBe(2)
    expect(data.default_count).toBeGreaterThan(0)
    expect(data.voices.length).toBe(data.default_count + data.cloned_count)
    expect(data.voices.some((v: { voice_id: string; source: string }) => v.voice_id === 'voice-1' && v.source === 'cloned')).toBe(true)
  })

  it('should mark response degraded on service errors', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.degraded).toBe(true)
    expect(data.cloned_count).toBe(0)
  })

  it('should mark response degraded on network errors', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(
      new TypeError('Failed to fetch')
    )

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.degraded).toBe(true)
    expect(data.cloned_count).toBe(0)
  })
})
