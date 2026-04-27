'use client'

/**
 * Responsive Container Component
 * Provides consistent responsive layout with max-width and padding
 */
import React from 'react'
import { cn } from '@/lib/utils'

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Maximum width variant
   * - sm: 640px
   * - md: 768px
   * - lg: 1024px
   * - xl: 1280px
   * - 2xl: 1400px
   * - full: 100%
   */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  /**
   * Padding variant
   * - none: 0
   * - tight: px-2 py-4
   * - compact: px-4 py-6
   * - default: px-4 py-8
   * - loose: px-6 py-12
   */
  padding?: 'none' | 'tight' | 'compact' | 'default' | 'loose'
  /**
   * Center content horizontally
   */
  center?: boolean
}

const maxWidthClasses = {
  sm: 'max-w-screen-sm',
  md: 'max-w-screen-md',
  lg: 'max-w-screen-lg',
  xl: 'max-w-screen-xl',
  '2xl': 'max-w-screen-2xl',
  full: 'max-w-full',
}

const paddingClasses = {
  none: '',
  tight: 'px-2 sm:px-4 py-4 sm:py-6',
  compact: 'px-4 sm:px-6 py-6 sm:py-8',
  default: 'px-4 sm:px-6 lg:px-8 py-8 sm:py-10 lg:py-12',
  loose: 'px-6 sm:px-8 lg:px-12 py-12 sm:py-16 lg:py-20',
}

export const Container = React.memo(function Container({
  children,
  className,
  maxWidth = '2xl',
  padding = 'default',
  center = true,
  ...props
}: ContainerProps) {
  return (
    <div
      className={cn(
        'w-full',
        maxWidthClasses[maxWidth],
        paddingClasses[padding],
        center && 'mx-auto',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
