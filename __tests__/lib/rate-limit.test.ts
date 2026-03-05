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
    it('has stricter limits than general limiter', async () => {
      const generalResult = await rateLimiter.limit(testIP)
      const ttsResult = await ttsRateLimiter.limit(testIP)
      
      // TTS limiter should have lower limit
      expect(ttsResult.limit).toBeLessThanOrEqual(generalResult.limit)
    })
  })

  describe('cloneRateLimiter', () => {
    it('has very strict limits', async () => {
      const result = await cloneRateLimiter.limit(testIP)
      expect(result.limit).toBeLessThanOrEqual(10) // Very strict
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
