/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import {
  allowDiagnosticRoute,
  denyUnlessMutableApiAuthorized,
} from '@/lib/api-access'

function req(url: string, headers: Record<string, string>) {
  return new NextRequest(url, { headers })
}

describe('allowDiagnosticRoute', () => {
  const origDiagnostic = process.env.DIAGNOSTIC_SECRET

  afterEach(() => {
    if (origDiagnostic !== undefined) process.env.DIAGNOSTIC_SECRET = origDiagnostic
    else delete process.env.DIAGNOSTIC_SECRET
  })

  it('allows localhost host when secret unset and no forwarded-for', () => {
    delete process.env.DIAGNOSTIC_SECRET
    expect(
      allowDiagnosticRoute(req('http://localhost:3000/api/metrics', { host: 'localhost:3000' }))
    ).toBe(true)
  })

  it('denies when x-forwarded-for present and secret unset', () => {
    delete process.env.DIAGNOSTIC_SECRET
    expect(
      allowDiagnosticRoute(
        req('http://localhost:3000/api/metrics', {
          host: 'localhost:3000',
          'x-forwarded-for': '203.0.113.1',
        })
      )
    ).toBe(false)
  })

  it('allows when secret matches header', () => {
    process.env.DIAGNOSTIC_SECRET = 'abc'
    expect(
      allowDiagnosticRoute(
        req('http://example.com/api/metrics', {
          host: 'example.com',
          'x-diagnostic-secret': 'abc',
          'x-forwarded-for': '1.2.3.4',
        })
      )
    ).toBe(true)
  })

  it('denies when secret set but header wrong', () => {
    process.env.DIAGNOSTIC_SECRET = 'abc'
    expect(
      allowDiagnosticRoute(
        req('http://localhost:3000/api/metrics', {
          host: 'localhost:3000',
          'x-diagnostic-secret': 'wrong',
        })
      )
    ).toBe(false)
  })
})

describe('denyUnlessMutableApiAuthorized', () => {
  const origKey = process.env.API_ROUTE_SECRET

  afterEach(() => {
    if (origKey !== undefined) process.env.API_ROUTE_SECRET = origKey
    else delete process.env.API_ROUTE_SECRET
  })

  it('returns null when API_ROUTE_SECRET unset', () => {
    delete process.env.API_ROUTE_SECRET
    const r = denyUnlessMutableApiAuthorized(
      req('http://localhost/api/tts', { host: 'localhost' })
    )
    expect(r).toBeNull()
  })

  it('returns 401 when secret set and no credentials', async () => {
    process.env.API_ROUTE_SECRET = 'sekret'
    const res = denyUnlessMutableApiAuthorized(
      req('http://localhost/api/tts', { host: 'localhost' })
    )
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
    const body = await res!.json()
    expect(body.error).toBe('Unauthorized')
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('allows Bearer token', () => {
    process.env.API_ROUTE_SECRET = 'sekret'
    const r = denyUnlessMutableApiAuthorized(
      req('http://localhost/api/tts', {
        host: 'localhost',
        authorization: 'Bearer sekret',
      })
    )
    expect(r).toBeNull()
  })

  it('allows x-api-key', () => {
    process.env.API_ROUTE_SECRET = 'sekret'
    const r = denyUnlessMutableApiAuthorized(
      req('http://localhost/api/tts', {
        host: 'localhost',
        'x-api-key': 'sekret',
      })
    )
    expect(r).toBeNull()
  })
})
