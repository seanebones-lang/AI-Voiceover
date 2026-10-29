import { NextRequest, NextResponse } from 'next/server'
import { allowDiagnosticRoute } from '@/lib/api-access'
import { SOTA_CLONE_CANDIDATES } from '@/lib/tts/sota-candidates'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!allowDiagnosticRoute(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({
    status: 'ok',
    generatedAt: new Date().toISOString(),
    currentEngines: { cloned: 'coqui_xtts_v2', stock: 'kokoro_82m' },
    externalApis: [],
    candidates: SOTA_CLONE_CANDIDATES,
  })
}

