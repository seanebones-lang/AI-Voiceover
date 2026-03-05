import { POST } from '@/app/api/clone-voice/route'
import { NextRequest } from 'next/server'

// Mock dependencies
jest.mock('@/lib/rate-limit', () => ({
  cloneRateLimiter: {
    limit: jest.fn().mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 86400000,
    }),
  },
}))

jest.mock('@/lib/config', () => ({
  config: {
    services: {
      xtts: {
        url: 'http://localhost:8081',
        timeout: 30000,
        retries: 2,
      },
    },
  },
  withRetry: jest.fn((fn) => fn()),
}))

global.fetch = jest.fn()

describe('POST /api/clone-voice', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should validate name is required', async () => {
    const formData = new FormData()
    formData.append('files', new File(['content'], 'test.wav', { type: 'audio/wav' }))

    const request = new NextRequest('http://localhost/api/clone-voice', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('Name is required')
  })

  it('should validate files are required', async () => {
    const formData = new FormData()
    formData.append('name', 'Test Voice')

    const request = new NextRequest('http://localhost/api/clone-voice', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('audio file')
  })

  it('should validate file count limit', async () => {
    const formData = new FormData()
    formData.append('name', 'Test Voice')
    
    // Add 6 files (over limit of 5)
    for (let i = 0; i < 6; i++) {
      const file = new File(['content'], `test${i}.wav`, { type: 'audio/wav' })
      Object.defineProperty(file, 'size', { value: 1024 * 1024 }) // 1MB
      formData.append('files', file)
    }

    const request = new NextRequest('http://localhost/api/clone-voice', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('Maximum 5')
  })

  it('should forward valid request to service', async () => {
    const formData = new FormData()
    formData.append('name', 'Test Voice')
    const file = new File(['content'], 'test.wav', { type: 'audio/wav' })
    Object.defineProperty(file, 'size', { value: 1024 * 1024 })
    formData.append('files', file)

    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ voice_id: 'clone_123' }),
    })

    const request = new NextRequest('http://localhost/api/clone-voice', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.voice_id).toBe('clone_123')
  })

  it('should handle rate limiting', async () => {
    const { cloneRateLimiter } = require('@/lib/rate-limit')
    cloneRateLimiter.limit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 3600000,
    })

    const formData = new FormData()
    formData.append('name', 'Test Voice')
    formData.append('files', new File(['content'], 'test.wav', { type: 'audio/wav' }))

    const request = new NextRequest('http://localhost/api/clone-voice', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(429)
    expect(data.error).toContain('Rate limit')
  })
})
