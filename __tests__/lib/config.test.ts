import { config, checkServiceHealth, withRetry } from '@/lib/config'

describe('Config', () => {
  describe('config', () => {
    it('detects environment correctly', () => {
      expect(['development', 'production', 'staging']).toContain(config.environment)
    })

    it('has service configurations', () => {
      expect(config.services.xtts).toBeDefined()
      expect(config.services.ttsV2).toBeDefined()
      expect(config.services.rag).toBeDefined()
    })

    it('has service URLs', () => {
      expect(config.services.xtts.url).toBeTruthy()
      expect(config.services.ttsV2.url).toBeTruthy()
    })
  })

  describe('checkServiceHealth', () => {
    beforeEach(() => {
      global.fetch = jest.fn()
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('returns healthy status for successful health check', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      })

      const result = await checkServiceHealth(config.services.xtts)

      expect(result.healthy).toBe(true)
      expect(result.latency).toBeDefined()
    })

    it('returns unhealthy status for failed health check', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await checkServiceHealth(config.services.xtts)

      expect(result.healthy).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('handles network errors', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

      const result = await checkServiceHealth(config.services.xtts)

      expect(result.healthy).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })

  describe('withRetry', () => {
    it('retries on failure', async () => {
      let attempts = 0
      const fn = jest.fn(async () => {
        attempts++
        if (attempts < 2) {
          throw new Error('Fail')
        }
        return 'success'
      })

      const result = await withRetry(fn, 2, 10)

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('throws after max retries', async () => {
      const fn = jest.fn(async () => {
        throw new Error('Always fails')
      })

      await expect(withRetry(fn, 2, 10)).rejects.toThrow('Always fails')
      expect(fn).toHaveBeenCalledTimes(3) // Initial + 2 retries
    })

    it('succeeds on first attempt', async () => {
      const fn = jest.fn(async () => 'success')

      const result = await withRetry(fn, 2, 10)

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })
})
