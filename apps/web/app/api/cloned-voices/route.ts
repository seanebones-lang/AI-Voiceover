import { NextResponse } from 'next/server'
import { config, getServiceUrl } from '@/lib/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (config.isRailway && !config.xttsConfigured) {
    return NextResponse.json(
      { error: 'Cloned voices unavailable', reason: 'XTTS not configured' },
      { status: 503 }
    )
  }
  try {
    const xttsUrl = getServiceUrl('xtts')
    const response = await fetch(`${xttsUrl}/voices`, { cache: 'no-store' })
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Cloned voices service error', status: response.status },
        { status: 503 }
      )
    }
    const data = await response.json()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Cloned voices unavailable',
        reason: err instanceof Error ? err.message : 'Service unreachable',
      },
      { status: 503 }
    )
  }
}
