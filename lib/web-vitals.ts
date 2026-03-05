/**
 * Web Vitals Performance Monitoring
 * Tracks Core Web Vitals and sends to analytics
 */

export interface Metric {
  id: string
  name: string
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  delta: number
  entries: PerformanceEntry[]
}

type ReportCallback = (metric: Metric) => void

// Web Vitals thresholds
const THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
}

function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const threshold = THRESHOLDS[name as keyof typeof THRESHOLDS]
  if (!threshold) return 'good'
  
  if (value <= threshold.good) return 'good'
  if (value <= threshold.poor) return 'needs-improvement'
  return 'poor'
}

function sendToAnalytics(metric: Metric) {
  // Send to your analytics service
  // Example: Google Analytics, Sentry, custom endpoint
  
  if (typeof window !== 'undefined' && (window as any).gtag) {
    ;(window as any).gtag('event', metric.name, {
      value: Math.round(metric.value),
      metric_id: metric.id,
      metric_value: metric.value,
      metric_delta: metric.delta,
      metric_rating: metric.rating,
    })
  }
  
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`📊 ${metric.name}:`, {
      value: metric.value.toFixed(2),
      rating: metric.rating,
      delta: metric.delta.toFixed(2),
    })
  }
  
  // Send to custom endpoint if configured
  if (process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT) {
    fetch(process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metric),
      keepalive: true,
    }).catch(() => {
      // Silently fail
    })
  }
}

export function reportWebVitals(onPerfEntry?: ReportCallback) {
  if (typeof window === 'undefined') return
  
  import('web-vitals').then(({ onCLS, onFID, onFCP, onLCP, onTTFB, onINP }) => {
    const report = (metric: Metric) => {
      const ratedMetric = {
        ...metric,
        rating: getRating(metric.name, metric.value),
      }
      
      sendToAnalytics(ratedMetric)
      onPerfEntry?.(ratedMetric)
    }
    
    onCLS(report)
    onFID(report)
    onFCP(report)
    onLCP(report)
    onTTFB(report)
    onINP(report)
  }).catch(() => {
    // web-vitals not available
  })
}
