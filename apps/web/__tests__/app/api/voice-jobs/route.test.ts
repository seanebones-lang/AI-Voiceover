import { GET } from '@/app/api/voice-jobs/route'

jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
}))
jest.mock('@/lib/queue', () => ({
  getVoiceQueue: jest.fn(() => null),
}))

describe('GET /api/voice-jobs', () => {
  it('returns 503 when auth provider throws', async () => {
    const { auth } = require('@clerk/nextjs/server')
    auth.mockRejectedValueOnce(new Error('auth offline'))

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(503)
    expect(data.error).toContain('Auth service unavailable')
  })

  it('returns 401 when user is not authenticated', async () => {
    const { auth } = require('@clerk/nextjs/server')
    auth.mockResolvedValueOnce({ userId: null, orgId: null })

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error).toContain('Unauthorized')
  })
})
