import { test, expect } from '@playwright/test'

test.describe('API Health', () => {
  test('GET /api/health returns 200 and status', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('status')
    expect(['ok', 'degraded']).toContain(data.status)
  })
})
