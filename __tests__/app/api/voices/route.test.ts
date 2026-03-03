/** @jest-environment node */
import { GET } from '@/app/api/voices/route'
import { NextRequest } from 'next/server'

// Mock the TTS service
global.fetch = jest.fn()

describe('GET /api/voices', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return voices from service', async () => {
    const mockVoices = [
      { voice_id: 'voice-1', name: 'Voice One', language: 'en', source: 'system' },
      { voice_id: 'voice-2', name: 'Voice Two', language: 'es', source: 'system' },
    ]

    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ voices: mockVoices }),
    })

    const request = new NextRequest('http://localhost/api/voices')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.default_count).toBeGreaterThan(0)
    expect(data.cloned_count).toBe(2)
    expect(data.voices.length).toBe(data.default_count + 2)
    const cloned = data.voices.filter((v: { source: string }) => v.source === 'cloned')
    expect(cloned).toHaveLength(2)
    expect(cloned.map((v: { voice_id: string }) => v.voice_id)).toEqual(['voice-1', 'voice-2'])
  })

  it('should handle service errors with default voices fallback', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const request = new NextRequest('http://localhost/api/voices')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.voices).toBeDefined()
    expect(data.cloned_count).toBe(0)
  })

  it('should handle network errors with default voices fallback', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(
      new TypeError('Failed to fetch')
    )

    const request = new NextRequest('http://localhost/api/voices')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.voices).toBeDefined()
    expect(data.cloned_count).toBe(0)
  })
})
