/**
 * Metrics Endpoint
 * Returns system metrics and performance statistics
 * Date: March 2026
 */

import { NextResponse } from 'next/server'
import { getMetricsSummary } from '@/lib/monitoring'

export const dynamic = 'force-dynamic'

export async function GET() {
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
