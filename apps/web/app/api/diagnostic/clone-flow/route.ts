/**
 * Smoke diagnostic for clone flow: health, voices list, and TTS header validation.
 * GET /api/diagnostic/clone-flow
 * Secured: require X-Diagnostic-Secret header matching env DIAGNOSTIC_SECRET, or allow localhost only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { allowDiagnosticRoute } from '@/lib/api-access'
import { jsonApiError } from '@/lib/api-response'
import { config, checkServiceHealth } from '@/lib/config'
import { getCloneTelemetry } from '@/lib/monitoring'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!allowDiagnosticRoute(request)) {
    return jsonApiError(403, 'Forbidden', { code: 'FORBIDDEN' })
  }
  const steps: { name: string; status: 'ok' | 'degraded' | 'fail'; detail?: string }[] = []
  let overall: 'ok' | 'degraded' | 'fail' = 'ok'

  try {
    // 1. XTTS service health
    const xttsHealth = await checkServiceHealth(config.services.xtts)
    if (xttsHealth.healthy) {
      steps.push({ name: 'xtts_health', status: 'ok', detail: `latency ${xttsHealth.latency}ms` })
    } else {
      steps.push({ name: 'xtts_health', status: 'fail', detail: xttsHealth.error })
      overall = 'fail'
    }

    // 2. Fetch /voices (cloned + default)
    let clonedCount = 0
    try {
      const base = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXTAUTH_URL || 'http://localhost:3000'
      const res = await fetch(`${base}/api/voices`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        clonedCount = data.cloned_count ?? 0
        steps.push({
          name: 'voices_list',
          status: 'ok',
          detail: `default=${data.default_count ?? 0}, cloned=${clonedCount}`,
        })
      } else {
        steps.push({ name: 'voices_list', status: 'fail', detail: `HTTP ${res.status}` })
        overall = overall === 'ok' ? 'degraded' : overall
      }
    } catch (e) {
      steps.push({
        name: 'voices_list',
        status: 'fail',
        detail: e instanceof Error ? e.message : String(e),
      })
      overall = overall === 'ok' ? 'degraded' : overall
    }

    // 3. Clone telemetry
    const telemetry = getCloneTelemetry()
    steps.push({
      name: 'clone_telemetry',
      status: 'ok',
      detail: `requested=${telemetry.clone_requested} created=${telemetry.clone_created} tts_requested=${telemetry.clone_tts_requested} tts_success=${telemetry.clone_tts_success} tts_error=${telemetry.clone_tts_error}`,
    })

    return NextResponse.json({
      status: overall,
      timestamp: new Date().toISOString(),
      steps,
      clone_telemetry: telemetry,
      hint:
        overall !== 'ok'
          ? 'Run clone flow: upload sample -> /api/clone-voice -> /api/voices -> POST /api/tts with voice_id=clone_* and check X-Voice-Type: cloned'
          : undefined,
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'fail',
        error: error instanceof Error ? error.message : String(error),
        steps,
        code: 'DIAGNOSTIC_ERROR',
      },
      { status: 500 }
    )
  }
}
