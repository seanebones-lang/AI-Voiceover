import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const XTTS_URL = process.env.XTTS_SIDECAR_URL || 'http://localhost:8081'

export async function GET() {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      nextjs: { status: 'healthy', version: '15.x' },
      sidecar: { status: 'unknown', url: XTTS_URL }
    },
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      XTTS_URL: XTTS_URL
    }
  }

  // Check Python sidecar
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    
    const response = await fetch(`${XTTS_URL}/health`, {
      signal: controller.signal
    })
    clearTimeout(timeout)
    
    if (response.ok) {
      const data = await response.json()
      health.services.sidecar = {
        status: 'healthy',
        url: XTTS_URL,
        ...data
      }
    } else {
      health.services.sidecar = {
        status: 'unhealthy',
        url: XTTS_URL,
        error: `HTTP ${response.status}`
      }
    }
  } catch (error) {
    health.services.sidecar = {
      status: 'unreachable',
      url: XTTS_URL,
      error: error instanceof Error ? error.message : 'Connection failed'
    }
    health.status = 'degraded'
  }

  return NextResponse.json(health)
}
