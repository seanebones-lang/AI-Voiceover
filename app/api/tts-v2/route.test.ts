import { POST } from '@/app/api/tts-v2/route'
import { NextRequest } from 'next/server'

// Mock the TTS service
global.fetch = jest.fn()

describe('POST /api/tts-v2', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should validate text input', async () => {
    const request = new NextRequest('http://localhost/api/tts-v2', {
      method: 'POST',
      body: JSON.stringify({ text: '' }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBeDefined()
  })

  it('should reject text over 10000 characters', async () => {
    const request = new NextRequest('http://localhost/api/tts-v2', {
      method: 'POST',
      body: JSON.stringify({ text: 'a'.repeat(10001) }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('10,000')
  })

  it('should forward valid request to TTS service', async () => {
    const mockAudioBuffer = new ArrayBuffer(8)
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => mockAudioBuffer,
    })

    const request = new NextRequest('http://localhost/api/tts-v2', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Hello world',
        voice_id: 'test-voice',
        emotion: 'happy',
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/tts'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    )
  })

  it('should handle TTS service errors', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'Service error' }),
    })

    const request = new NextRequest('http://localhost/api/tts-v2', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Hello world',
        voice_id: 'test-voice',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBeDefined()
  })

  it('should handle connection errors', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(
      new TypeError('Failed to fetch')
    )

    const request = new NextRequest('http://localhost/api/tts-v2', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Hello world',
        voice_id: 'test-voice',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(503)
    expect(data.error).toContain('unavailable')
  })
})
