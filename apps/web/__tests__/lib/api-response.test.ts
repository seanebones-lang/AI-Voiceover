/**
 * @jest-environment node
 */
import { jsonApiError } from '@/lib/api-response'

describe('jsonApiError', () => {
  it('includes code, requestId, hint, details and sets X-Request-Id', async () => {
    const res = jsonApiError(503, 'Upstream failed', {
      code: 'UPSTREAM',
      requestId: 'req-1',
      hint: 'Retry later',
      details: 'timeout',
    })
    expect(res.status).toBe(503)
    expect(res.headers.get('X-Request-Id')).toBe('req-1')
    const body = await res.json()
    expect(body).toEqual({
      error: 'Upstream failed',
      code: 'UPSTREAM',
      requestId: 'req-1',
      hint: 'Retry later',
      details: 'timeout',
    })
  })

  it('omits optional fields when not passed', async () => {
    const res = jsonApiError(400, 'Bad')
    const body = await res.json()
    expect(body).toEqual({ error: 'Bad' })
    expect(res.headers.get('X-Request-Id')).toBeNull()
  })
})
