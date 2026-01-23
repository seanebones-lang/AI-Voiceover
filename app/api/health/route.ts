import { NextResponse } from 'next/server'
import { config, checkServiceHealth } from '@/lib/config'

export const dynamic = 'force-dynamic'

interface SidecarStatus {
  status: string
  url: string
  error?: string
  service?: string
  tts_engine?: string
  cloned_voices?: number
}

export async function GET() {
  const startTime = Date.now()
  
  const health: {
    status: string
    timestamp: string
    uptime: number
    services: {
      nextjs: { status: string; version: string }
      xtts: SidecarStatus
      ttsV2?: SidecarStatus
      rag?: SidecarStatus
    }
    environment: {
      NODE_ENV: string | undefined
      isRailway: boolean
      environment: string
    }
    latency: number
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      nextjs: { status: 'healthy', version: '15.x' },
      xtts: { status: 'unknown', url: config.services.xtts.url }
    },
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      isRailway: config.isRailway,
      environment: config.environment
    },
    latency: 0
  }

  // Check all services in parallel
  const [xttsHealth, ttsV2Health, ragHealth] = await Promise.allSettled([
    checkServiceHealth(config.services.xtts),
    checkServiceHealth(config.services.ttsV2),
    checkServiceHealth(config.services.rag),
  ])

  // XTTS Service
  if (xttsHealth.status === 'fulfilled' && xttsHealth.value.healthy) {
    try {
      const response = await fetch(`${config.services.xtts.url}/health`)
      if (response.ok) {
        const data = await response.json().catch(() => ({}))
        health.services.xtts = {
          status: 'healthy',
          url: config.services.xtts.url,
          ...data
        }
      } else {
        throw new Error(`Health check returned ${response.status}`)
      }
    } catch {
      health.services.xtts = {
        status: 'healthy',
        url: config.services.xtts.url,
        latency: xttsHealth.value.latency
      }
    }
  } else {
    health.services.xtts = {
      status: 'unhealthy',
      url: config.services.xtts.url,
      error: xttsHealth.status === 'fulfilled' ? xttsHealth.value.error : 'Service check failed'
    }
    health.status = 'degraded'
  }

  // TTS V2 Service (optional)
  if (ttsV2Health.status === 'fulfilled' && ttsV2Health.value.healthy) {
    health.services.ttsV2 = {
      status: 'healthy',
      url: config.services.ttsV2.url,
      latency: ttsV2Health.value.latency
    }
  } else {
    health.services.ttsV2 = {
      status: 'unavailable',
      url: config.services.ttsV2.url
    }
  }

  // RAG Service (optional)
  if (ragHealth.status === 'fulfilled' && ragHealth.value.healthy) {
    health.services.rag = {
      status: 'healthy',
      url: config.services.rag.url,
      latency: ragHealth.value.latency
    }
  } else {
    health.services.rag = {
      status: 'unavailable',
      url: config.services.rag.url
    }
  }

  health.latency = Date.now() - startTime

  return NextResponse.json(health)
}
