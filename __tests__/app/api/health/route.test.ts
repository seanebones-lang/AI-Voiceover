import { GET } from '@/app/api/health/route'
import { NextRequest } from 'next/server'

// Mock TTS service
global.fetch = jest.fn()

describe('GET /api/health', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return health status', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok', version: '1.0.0' }),
    })

    const request = new NextRequest('http://localhost/api/health')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('status')
    expect(data).toHaveProperty('capabilities')
    expect(data.capabilities).toMatchObject({
      tts_default: true,
      tts_xai: expect.any(Boolean),
      cloning: expect.any(Boolean),
      tts_v2: expect.any(Boolean),
      rag: expect.any(Boolean),
    })
  })

  it('should handle service unavailable', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(
      new TypeError('Failed to fetch')
    )

    const request = new NextRequest('http://localhost/api/health')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(503)
    expect(data.status).toBe('error')
  })
})
