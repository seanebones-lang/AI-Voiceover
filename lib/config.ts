/**
 * Centralized Configuration & Service Discovery
 * Handles Railway service URLs, environment detection, and service health
 * Date: January 2026
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

// Railway service discovery - uses internal service names
// In Railway, services communicate via service names (e.g., xtts-service:8081)
const getServiceUrl = (serviceName: string, defaultPort: number, envVar?: string): string => {
  // Priority: Environment variable > Railway service name > localhost
  if (envVar && process.env[envVar]) {
    return process.env[envVar]!
  }
  
  if (isRailway) {
    // Railway internal networking - use service names
    return `http://${serviceName}:${defaultPort}`
  }
  
  // Local development
  return `http://localhost:${defaultPort}`
}

// Service configurations
export const config: AppConfig = {
  environment: isProduction ? 'production' : 'development',
  isRailway,
  services: {
    xtts: {
      url: getServiceUrl('xtts-service', 8081, 'XTTS_URL'),
      healthEndpoint: '/health',
      timeout: 30000, // 30s for TTS generation
      retries: 2,
    },
    ttsV2: {
      url: getServiceUrl('tts-v2-service', 8082, 'TTS_V2_URL'),
      healthEndpoint: '/health',
      timeout: 45000, // 45s for advanced TTS
      retries: 2,
    },
    rag: {
      url: getServiceUrl('rag-service', 8001, 'RAG_API_URL'),
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

// Service health check with retry logic
export async function checkServiceHealth(
  service: ServiceConfig,
  signal?: AbortSignal
): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  const startTime = Date.now()
  
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), service.timeout)
    
    if (signal) {
      signal.addEventListener('abort', () => controller.abort())
    }
    
    const response = await fetch(`${service.url}${service.healthEndpoint}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'NextEleven-HealthCheck/1.0',
      },
    })
    
    clearTimeout(timeout)
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
