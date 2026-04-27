import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { jsonApiError } from '@/lib/api-response'

/**
 * Diagnostic/metrics routes: same trust model as `/api/diagnostic/clone-flow`.
 * - If `DIAGNOSTIC_SECRET` is set: require `x-diagnostic-secret` to match.
 * - If unset: allow only direct localhost (host prefix) and reject when `x-forwarded-for` is present
 *   (spoofing risk without a shared secret).
 */
export function allowDiagnosticRoute(request: NextRequest): boolean {
  const secret = process.env.DIAGNOSTIC_SECRET
  const provided = request.headers.get('x-diagnostic-secret')
  if (secret && provided === secret) return true
  if (!secret) {
    if (request.headers.get('x-forwarded-for')) return false
    const host = request.headers.get('host') || ''
    return host.startsWith('localhost') || host.startsWith('127.0.0.1')
  }
  return false
}

/**
 * When `API_ROUTE_SECRET` is set, POST mutation routes require either
 * `Authorization: Bearer <secret>` or `x-api-key: <secret>`.
 * When unset, behavior matches previous open API (same-origin UI works without extra headers).
 */
export function denyUnlessMutableApiAuthorized(request: NextRequest): NextResponse | null {
  const key = process.env.API_ROUTE_SECRET?.trim()
  if (!key) return null

  const auth = request.headers.get('authorization')
  const bearer =
    auth?.length && /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, '').trim() : ''
  const apiKey = request.headers.get('x-api-key')
  if (bearer === key || apiKey === key) return null

  return jsonApiError(401, 'Unauthorized', { code: 'UNAUTHORIZED' })
}
