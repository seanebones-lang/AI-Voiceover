process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || 'test_clerk_secret'
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'test_clerk_publishable'

import { GET } from '@/app/api/voice-jobs/route'

jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
}))
jest.mock('@/lib/queue', () => ({
  getVoiceQueue: jest.fn(() => null),
}))

describe('GET /api/voice-jobs', () => {
  it('returns 503 when auth is not configured in runtime', async () => {
    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(503)
    expect(data.error).toContain('Auth not configured')
  })
})
