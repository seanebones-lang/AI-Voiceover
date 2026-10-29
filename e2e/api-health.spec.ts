import { test, expect } from '@playwright/test'

test.describe('API Health', () => {
  test('GET /api/health returns 200 and status', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('status')
    expect(['ok', 'degraded']).toContain(data.status)
  })

  test('GET /api/health returns capabilities', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('capabilities')
    const cap = data.capabilities
    expect(cap).toHaveProperty('tts_default')
    expect(cap).not.toHaveProperty('tts_xai')
    expect(cap).toHaveProperty('cloning')
    expect(cap).toHaveProperty('tts_v2')
    expect(cap).toHaveProperty('rag')
    expect(typeof cap.tts_default).toBe('boolean')
    expect(typeof cap.cloning).toBe('boolean')
  })
})
