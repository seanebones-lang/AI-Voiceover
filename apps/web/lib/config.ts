/**
 * Centralized Configuration & Service Discovery
 * Handles Railway service URLs, environment detection, and service health
 * Date: March 2026
 */

export interface ServiceConfig {
  url: string
  healthEndpoint: string
  timeout: number
  retries: number
}

export interface AppConfig {
  environment: 'development' | 'production' | 'staging'
  isRailway: boolean
  xttsConfigured: boolean
  services: {
    xtts: ServiceConfig
    ttsV2: ServiceConfig
    rag: ServiceConfig
  }
  railway: {
    projectId: string
    environmentId: string
    token: string
  }
}

// Detect environment
const isRailway = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_PROJECT_ID
const isProduction = process.env.NODE_ENV === 'production'

// Railway service discovery. Support XTTS_URL (current) and XTTS_SIDECAR_URL (legacy).
const resolveServiceUrl = (serviceName: string, defaultPort: number, envVar?: string, legacyEnvVar?: string): string => {
  if (envVar && process.env[envVar]) return process.env[envVar]!
  if (legacyEnvVar && process.env[legacyEnvVar]) return process.env[legacyEnvVar]!
  if (isRailway) return `http://${serviceName}:${defaultPort}`
  return `http://localhost:${defaultPort}`
}

// Service configurations
export const config: AppConfig = {
  environment: isProduction ? 'production' : 'development',
  isRailway,
  xttsConfigured: !!(process.env.XTTS_URL || process.env.XTTS_SIDECAR_URL),
  services: {
    xtts: {
      url: resolveServiceUrl('xtts-service', 8081, 'XTTS_URL', 'XTTS_SIDECAR_URL'),
      healthEndpoint: '/health',
      timeout: 30000, // 30s for TTS generation
      retries: 2,
    },
    ttsV2: {
      url: resolveServiceUrl('tts-v2-service', 8082, 'TTS_V2_URL'),
      healthEndpoint: '/health',
      timeout: 45000, // 45s for advanced TTS
      retries: 2,
    },
    rag: {
      url: resolveServiceUrl('rag-service', 8001, 'RAG_API_URL'),
      healthEndpoint: '/health',
      timeout: 10000, // 10s for RAG queries
      retries: 1,
    },
  },
  railway: {
    projectId: process.env.RAILWAY_PROJECT_ID || '',
    environmentId: process.env.RAILWAY_ENVIRONMENT_ID || '',
    token: process.env.RAILWAY_TOKEN || '',
  },
}

// Service health check; pass timeoutMs for fast health endpoint (e.g. 5000)
export async function checkServiceHealth(
  service: ServiceConfig,
  signal?: AbortSignal,
  timeoutMs?: number
): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  const startTime = Date.now()
  const healthTimeout = timeoutMs ?? service.timeout
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), healthTimeout)
    
    if (signal) {
      signal.addEventListener('abort', () => controller.abort())
    }
    
    const response = await fetch(`${service.url}${service.healthEndpoint}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'NextEleven-HealthCheck/1.0',
      },
    })
    
    clearTimeout(t)
    const latency = Date.now() - startTime
    
    if (response.ok) {
      return { healthy: true, latency }
    } else {
      return { healthy: false, latency, error: `HTTP ${response.status}` }
    }
  } catch (error) {
    const latency = Date.now() - startTime
    return {
      healthy: false,
      latency,
      error: error instanceof Error ? error.message : 'Connection failed',
    }
  }
}

// Retry wrapper for service calls
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000,
  backoff: number = 2
): Promise<T> {
  let lastError: Error | unknown
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      
      if (attempt < retries) {
        const waitTime = delay * Math.pow(backoff, attempt)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }
      
      // Last attempt failed, throw the error
      throw error
    }
  }
  
  // This should never be reached, but TypeScript needs it for type safety
  throw lastError || new Error('Retry failed: unknown error')
}

// Get service URL helper
export function getServiceUrl(service: keyof AppConfig['services']): string {
  return config.services[service].url
}
