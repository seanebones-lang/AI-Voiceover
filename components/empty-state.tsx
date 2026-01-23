'use client'

/**
 * Empty State Component
 * Displays helpful messages when there's no content
 */
import { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="p-4 rounded-full bg-slate-800/50 mb-4">
        <Icon className="h-8 w-8 text-slate-400" aria-hidden="true" />
      </div>
      
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-400 max-w-sm mb-6">{description}</p>
      
      {action && (
        <Button
          onClick={action.onClick}
          className="bg-purple-600 hover:bg-purple-500"
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
