/**
 * @jest-environment node
 */
import { GET } from '@/app/api/metrics/route'
import { NextRequest } from 'next/server'

describe('GET /api/metrics', () => {
  const origSecret = process.env.DIAGNOSTIC_SECRET

  afterEach(() => {
    if (origSecret !== undefined) process.env.DIAGNOSTIC_SECRET = origSecret
    else delete process.env.DIAGNOSTIC_SECRET
  })

  it('returns 403 when x-forwarded-for is set and DIAGNOSTIC_SECRET is unset', async () => {
    delete process.env.DIAGNOSTIC_SECRET
    const request = new NextRequest('http://localhost:3000/api/metrics', {
      headers: {
        host: 'localhost:3000',
        'x-forwarded-for': '198.51.100.2',
      },
    })
    const response = await GET(request)
    expect(response.status).toBe(403)
    const data = await response.json()
    expect(data.code).toBe('FORBIDDEN')
  })

  it('returns 200 on localhost without forwarded-for when secret unset', async () => {
    delete process.env.DIAGNOSTIC_SECRET
    const request = new NextRequest('http://localhost:3000/api/metrics', {
      headers: { host: 'localhost:3000' },
    })
    const response = await GET(request)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('metrics')
    expect(data).toHaveProperty('timestamp')
  })

  it('returns 200 when x-diagnostic-secret matches DIAGNOSTIC_SECRET', async () => {
    process.env.DIAGNOSTIC_SECRET = 'metrics-test-secret'
    const request = new NextRequest('http://localhost:3000/api/metrics', {
      headers: {
        host: 'example.com',
        'x-forwarded-for': '1.2.3.4',
        'x-diagnostic-secret': 'metrics-test-secret',
      },
    })
    const response = await GET(request)
    expect(response.status).toBe(200)
  })
})
