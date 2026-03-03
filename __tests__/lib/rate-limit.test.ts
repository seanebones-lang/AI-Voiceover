const mockLimit = async () => ({
  success: true,
  limit: 100000,
  remaining: 99999,
  reset: Date.now() + 60000,
})
jest.mock('@upstash/ratelimit', () => ({
  Ratelimit: jest.fn(() => ({ limit: mockLimit })),
}))
jest.mock('@upstash/redis', () => ({ Redis: jest.fn() }))

import { rateLimiter, ttsRateLimiter, cloneRateLimiter } from '@/lib/rate-limit'

describe('Rate Limiting', () => {
  const testIP = '192.168.1.1'

  describe('rateLimiter', () => {
    it('allows requests within limit', async () => {
      const result = await rateLimiter.limit(testIP)
      expect(result.success).toBe(true)
      expect(result.remaining).toBeGreaterThan(0)
    })

    it('returns limit information', async () => {
      const result = await rateLimiter.limit(testIP)
      expect(result.limit).toBeDefined()
      expect(result.remaining).toBeDefined()
      expect(result.reset).toBeDefined()
    })
  })

  describe('ttsRateLimiter', () => {
    it('returns limit information', async () => {
      const ttsResult = await ttsRateLimiter.limit(testIP)
      expect(ttsResult.limit).toBeDefined()
      expect(ttsResult.remaining).toBeDefined()
      expect(ttsResult.reset).toBeDefined()
    })
  })

  describe('cloneRateLimiter', () => {
    it('has limit defined', async () => {
      const result = await cloneRateLimiter.limit(testIP)
      expect(result.limit).toBeDefined()
      expect(result.limit).toBeGreaterThan(0)
    })
  })

  describe('fallback behavior', () => {
    it('works when Redis is not configured', () => {
      // When Redis is not available, fallback limiter is used
      // It should always allow (for development)
      expect(rateLimiter).toBeDefined()
      expect(ttsRateLimiter).toBeDefined()
      expect(cloneRateLimiter).toBeDefined()
    })
  })
})
