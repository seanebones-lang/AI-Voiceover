'use client'

/**
 * Web Vitals Tracker Component
 * Tracks and reports Core Web Vitals metrics
 */
import { useEffect } from 'react'
import { reportWebVitals } from '@/lib/web-vitals'

export function WebVitalsTracker() {
  useEffect(() => {
    reportWebVitals()
  }, [])
  
  return null // This component doesn't render anything
}
