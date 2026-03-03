/** @jest-environment node */
import { POST } from '@/app/api/tts/route'
import { NextRequest } from 'next/server'

global.fetch = jest.fn()

describe('POST /api/tts', () => {
  beforeEach(() => jest.clearAllMocks())

  it('validates request body', async () => {
    const req = new NextRequest('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBeDefined()
  })

  it('requires text', async () => {
    const req = new NextRequest('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ voice_id: 'Eve' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
