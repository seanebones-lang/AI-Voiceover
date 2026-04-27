'use client'

/**
 * Quality Report Component
 * Displays audio quality metrics and recommendations
 */
import React from 'react'
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QualityReportProps {
  warnings?: string[]
  recommendations?: string[]
  totalDuration?: number
  className?: string
}

export const QualityReport = React.memo(function QualityReport({ 
  warnings = [], 
  recommendations = [], 
  totalDuration,
  className 
}: QualityReportProps) {
  if (warnings.length === 0 && recommendations.length === 0 && !totalDuration) {
    return null
  }

  return (
    <div className={cn("space-y-3 p-4 rounded-lg bg-slate-800/50 border border-slate-700", className)}>
      {totalDuration !== undefined && (
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Info className="h-4 w-4 text-blue-400" aria-hidden="true" />
          <span>Total duration: {totalDuration < 60 
            ? `${totalDuration.toFixed(1)}s`
            : `${Math.floor(totalDuration / 60)}:${Math.floor(totalDuration % 60).toString().padStart(2, '0')}`
          }</span>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-yellow-400">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <span>Warnings</span>
          </div>
          <ul className="space-y-1 ml-6">
            {warnings.map((warning, i) => (
              <li key={i} className="text-xs text-yellow-300/80 list-disc">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-400">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            <span>Recommendations</span>
          </div>
          <ul className="space-y-1 ml-6">
            {recommendations.map((rec, i) => (
              <li key={i} className="text-xs text-blue-300/80 list-disc">
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
})
