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
  latency?: number
}

export async function GET(_request?: Request) {
  try {
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
      capabilities: { tts_default: boolean; tts_xai: boolean; cloning: boolean; tts_v2: boolean; rag: boolean }
      deployment: {
        xttsUrlConfigured: boolean
        xttsUrl: string
        xttsRuntimeDevice?: string
        xttsCudaAvailable?: boolean
        xttsVoicesDir?: string
        xttsVoicesDirPersistent?: boolean
        xttsCorsOrigins?: string[]
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
      capabilities: {
        tts_default: true,
        tts_xai: !!process.env.XAI_API_KEY,
        cloning: false,
        tts_v2: false,
        rag: false
      },
      deployment: {
        xttsUrlConfigured: config.xttsConfigured,
        xttsUrl: config.services.xtts.url,
      },
      latency: 0
    }

    const healthTimeoutMs = 5000
    const [xttsHealth, ttsV2Health, ragHealth] = await Promise.allSettled([
      config.isRailway && !config.xttsConfigured
        ? Promise.resolve({ healthy: false, error: 'unconfigured' })
        : checkServiceHealth(config.services.xtts, undefined, healthTimeoutMs),
      checkServiceHealth(config.services.ttsV2, undefined, healthTimeoutMs),
      checkServiceHealth(config.services.rag, undefined, healthTimeoutMs),
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
          health.deployment.xttsRuntimeDevice = typeof data.device === 'string' ? data.device : undefined
          health.deployment.xttsCudaAvailable = typeof data.cuda_available === 'boolean' ? data.cuda_available : undefined
          health.deployment.xttsVoicesDir = typeof data.voices_directory === 'string' ? data.voices_directory : undefined
          health.deployment.xttsVoicesDirPersistent =
            typeof data.voices_directory_persistent === 'boolean' ? data.voices_directory_persistent : undefined
          health.deployment.xttsCorsOrigins = Array.isArray(data.cors_origins) ? data.cors_origins : undefined
        } else {
          throw new Error(`Health check returned ${response.status}`)
        }
      } catch {
        health.services.xtts = {
          status: 'healthy',
          url: config.services.xtts.url,
          latency: (xttsHealth.value as { latency?: number }).latency
        }
      }
    } else {
      const isUnconfigured = xttsHealth.status === 'fulfilled' && (xttsHealth.value as { error?: string }).error === 'unconfigured'
      health.services.xtts = {
        status: isUnconfigured ? 'unconfigured' : 'unhealthy',
        url: config.services.xtts.url,
        error: xttsHealth.status === 'fulfilled' ? (xttsHealth.value as { error?: string }).error : 'Service check failed'
      }
      if (!isUnconfigured) health.status = 'degraded'
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

    health.capabilities.cloning = xttsHealth.status === 'fulfilled' && (xttsHealth.value as { healthy?: boolean }).healthy === true
    health.capabilities.tts_v2 = ttsV2Health.status === 'fulfilled' && (ttsV2Health.value as { healthy?: boolean }).healthy === true
    health.capabilities.rag = ragHealth.status === 'fulfilled' && (ragHealth.value as { healthy?: boolean }).healthy === true

    health.latency = Date.now() - startTime

    // When XTTS is configured but unhealthy, return 200 with status 'degraded' so the deploy
    // succeeds (Railway healthcheck passes). Monitoring can use body.status and services.xtts.
    const xttsConfiguredButUnhealthy =
      config.xttsConfigured &&
      !(xttsHealth.status === 'fulfilled' && (xttsHealth.value as { healthy?: boolean }).healthy === true)
    if (xttsConfiguredButUnhealthy) {
      health.status = 'degraded'
    }
    return NextResponse.json(health)
  } catch (err) {
    return NextResponse.json(
      {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 200 }
    )
  }
}
