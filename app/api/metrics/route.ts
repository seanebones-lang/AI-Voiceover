/**
 * Metrics Endpoint
 * Returns system metrics and performance statistics.
 * Secured: require X-Diagnostic-Secret header matching env DIAGNOSTIC_SECRET, or allow localhost only.
 * Date: March 2026
 */

import { NextRequest, NextResponse } from 'next/server'
import { getMetricsSummary } from '@/lib/monitoring'

export const dynamic = 'force-dynamic'

function isLocalRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get('x-forwarded-for')
  const host = request.headers.get('host') || ''
  if (forwarded) {
    const ip = forwarded.split(',')[0]?.trim()
    return ip === '127.0.0.1' || ip === '::1'
  }
  return host.startsWith('localhost') || host.startsWith('127.0.0.1')
}

export async function GET(request: NextRequest) {
  const secret = process.env.DIAGNOSTIC_SECRET
  const provided = request.headers.get('x-diagnostic-secret')
  const allowed = secret ? provided === secret : isLocalRequest(request)

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const summary = getMetricsSummary()

    return NextResponse.json({
      metrics: summary,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to retrieve metrics' },
      { status: 500 }
    )
  }
}
