'use client'

/**
 * Responsive Section Component
 * Semantic section with responsive spacing and layout
 */
import React from 'react'
import { cn } from '@/lib/utils'

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * Section title
   */
  title?: string
  /**
   * Section description
   */
  description?: string
  /**
   * Padding variant
   */
  padding?: 'none' | 'tight' | 'compact' | 'default' | 'loose'
  /**
   * Max width container
   */
  container?: boolean
  /**
   * Container max width
   */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  /**
   * Background variant
   */
  variant?: 'default' | 'muted' | 'accent'
}

const paddingClasses = {
  none: '',
  tight: 'py-4 sm:py-6',
  compact: 'py-6 sm:py-8',
  default: 'py-8 sm:py-12 lg:py-16',
  loose: 'py-12 sm:py-16 lg:py-20',
}

const variantClasses = {
  default: '',
  muted: 'bg-slate-900/30',
  accent: 'bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-cyan-500/10',
}

export const Section = React.memo(function Section({
  children,
  className,
  title,
  description,
  padding = 'default',
  container = true,
  maxWidth = '2xl',
  variant = 'default',
  ...props
}: SectionProps) {
  const maxWidthClasses = {
    sm: 'max-w-screen-sm',
    md: 'max-w-screen-md',
    lg: 'max-w-screen-lg',
    xl: 'max-w-screen-xl',
    '2xl': 'max-w-screen-2xl',
    full: 'max-w-full',
  }

  const content = (
    <>
      {(title || description) && (
        <div className="mb-6 sm:mb-8 lg:mb-12 text-center">
          {title && (
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-4">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-sm sm:text-base lg:text-lg text-slate-400 max-w-2xl mx-auto">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </>
  )

  return (
    <section
      className={cn(
        'w-full',
        paddingClasses[padding],
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {container ? (
        <div className={cn('mx-auto px-4 sm:px-6 lg:px-8', maxWidthClasses[maxWidth])}>
          {content}
        </div>
      ) : (
        content
      )}
    </section>
  )
})
