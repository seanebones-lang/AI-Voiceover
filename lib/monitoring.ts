/**
 * Production Monitoring & Logging
 * Structured logging, metrics, and error tracking
 * Date: March 2026
 */

export interface LogContext {
  requestId?: string
  userId?: string
  ip?: string
  userAgent?: string
  [key: string]: unknown
}

export interface Metrics {
  endpoint: string
  method: string
  statusCode: number
  latency: number
  timestamp: string
  error?: string
  requestId?: string
  voiceType?: 'cloned' | 'standard'
}

/** Clone-flow telemetry counters (in-memory; extend to external in production) */
export interface CloneTelemetry {
  clone_requested: number
  clone_created: number
  clone_created_error: number
  clone_tts_requested: number
  clone_tts_success: number
  clone_tts_fallback_default: number
  clone_tts_error: number
}

class Logger {
  private isProduction: boolean

  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production'
  }

  private formatLog(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString()
    const contextStr = context ? ` ${JSON.stringify(context)}` : ''
    return `[${timestamp}] [${level}] ${message}${contextStr}`
  }

  info(message: string, context?: LogContext): void {
    console.log(this.formatLog('INFO', message, context))
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatLog('WARN', message, context))
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorDetails = error instanceof Error 
      ? { message: error.message, stack: error.stack }
      : { error: String(error) }
    
    console.error(this.formatLog('ERROR', message, { ...context, ...errorDetails }))
  }

  debug(message: string, context?: LogContext): void {
    if (!this.isProduction) {
      console.debug(this.formatLog('DEBUG', message, context))
    }
  }
}

export const logger = new Logger()

// Metrics collection (in-memory for now, can be extended to external service)
const metrics: Metrics[] = []
const MAX_METRICS = 1000 // Keep last 1000 metrics

const cloneTelemetry: CloneTelemetry = {
  clone_requested: 0,
  clone_created: 0,
  clone_created_error: 0,
  clone_tts_requested: 0,
  clone_tts_success: 0,
  clone_tts_fallback_default: 0,
  clone_tts_error: 0,
}

export function recordCloneMetric(key: keyof CloneTelemetry): void {
  if (key in cloneTelemetry) {
    (cloneTelemetry as unknown as Record<string, number>)[key]++
  }
}

export function getCloneTelemetry(): CloneTelemetry {
  return { ...cloneTelemetry }
}

export function recordMetric(metric: Metrics): void {
  metrics.push(metric)
  
  // Keep only recent metrics
  if (metrics.length > MAX_METRICS) {
    metrics.shift()
  }
  
  // In production, you might want to send to external service
  // e.g., Datadog, Prometheus, CloudWatch, etc.
  if (process.env.NODE_ENV === 'production') {
    // Example: Send to external metrics service
    // sendToMetricsService(metric)
  }
}

export function getMetrics(): Metrics[] {
  return [...metrics]
}

export function getMetricsSummary(): {
  total: number
  byEndpoint: Record<string, { count: number; avgLatency: number; errors: number }>
  byStatusCode: Record<number, number>
  cloneTelemetry: CloneTelemetry
} {
  const summary = {
    total: metrics.length,
    byEndpoint: {} as Record<string, { count: number; avgLatency: number; errors: number }>,
    byStatusCode: {} as Record<number, number>,
    cloneTelemetry: getCloneTelemetry(),
  }

  for (const metric of metrics) {
    // By endpoint
    if (!summary.byEndpoint[metric.endpoint]) {
      summary.byEndpoint[metric.endpoint] = { count: 0, avgLatency: 0, errors: 0 }
    }
    const endpoint = summary.byEndpoint[metric.endpoint]
    endpoint.count++
    endpoint.avgLatency = (endpoint.avgLatency * (endpoint.count - 1) + metric.latency) / endpoint.count
    if (metric.error) {
      endpoint.errors++
    }

    // By status code
    summary.byStatusCode[metric.statusCode] = (summary.byStatusCode[metric.statusCode] || 0) + 1
  }

  return summary
}

// Request ID generation
export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// Performance monitoring wrapper
export function withMetrics<T>(
  endpoint: string,
  method: string,
  handler: () => Promise<T>
): Promise<T> {
  const startTime = Date.now()
  const requestId = generateRequestId()

  return handler()
    .then((result) => {
      const latency = Date.now() - startTime
      recordMetric({
        endpoint,
        method,
        statusCode: 200,
        latency,
        timestamp: new Date().toISOString(),
      })
      logger.info(`Request completed: ${method} ${endpoint}`, {
        requestId,
        latency,
        statusCode: 200,
      })
      return result
    })
    .catch((error) => {
      const latency = Date.now() - startTime
      const statusCode = error.statusCode || 500
      recordMetric({
        endpoint,
        method,
        statusCode,
        latency,
        timestamp: new Date().toISOString(),
        error: error.message || String(error),
      })
      logger.error(`Request failed: ${method} ${endpoint}`, error, {
        requestId,
        latency,
        statusCode,
      })
      throw error
    })
}
