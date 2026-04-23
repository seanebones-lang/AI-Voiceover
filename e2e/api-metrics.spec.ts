import { test, expect } from '@playwright/test'

test.describe('API metrics', () => {
  test('GET /api/metrics returns payload or diagnostic 403', async ({ request }) => {
    const res = await request.get('/api/metrics')
    const status = res.status()
    if (status === 200) {
      const data = await res.json()
      expect(data).toHaveProperty('metrics')
      expect(data).toHaveProperty('timestamp')
    } else {
      expect(status).toBe(403)
      const data = await res.json()
      expect(data.code).toBe('FORBIDDEN')
    }
  })
})
