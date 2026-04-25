/**
 * Metrics Endpoint
 * Returns system metrics and performance statistics.
 * Secured: require X-Diagnostic-Secret header matching env DIAGNOSTIC_SECRET, or allow localhost only.
 * Date: March 2026
 */

import { NextRequest, NextResponse } from 'next/server'
import { allowDiagnosticRoute } from '@/lib/api-access'
import { jsonApiError } from '@/lib/api-response'
import { getMetricsSummary } from '@/lib/monitoring'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!allowDiagnosticRoute(request)) {
    return jsonApiError(403, 'Forbidden', { code: 'FORBIDDEN' })
  }
  try {
    const summary = getMetricsSummary()

    return NextResponse.json({
      metrics: summary,
      timestamp: new Date().toISOString(),
    })
  } catch {
    return jsonApiError(500, 'Failed to retrieve metrics', { code: 'METRICS_ERROR' })
  }
}
