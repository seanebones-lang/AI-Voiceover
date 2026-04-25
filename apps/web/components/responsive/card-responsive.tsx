'use client'

/**
 * Responsive Card Component
 * Card with responsive padding, spacing, and layout
 */
import React from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ResponsiveCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Card title
   */
  title?: string
  /**
   * Card description
   */
  description?: string
  /**
   * Padding variant
   * - tight: p-3 sm:p-4
   * - compact: p-4 sm:p-6
   * - default: p-6
   * - loose: p-6 sm:p-8
   */
  padding?: 'tight' | 'compact' | 'default' | 'loose'
  /**
   * Show header
   */
  showHeader?: boolean
  /**
   * Show footer
   */
  footer?: React.ReactNode
  /**
   * Responsive layout
   * - stack: Always vertical
   * - auto: Responsive (stack on mobile, side-by-side on desktop)
   */
  layout?: 'stack' | 'auto'
}

const paddingClasses = {
  tight: 'p-3 sm:p-4',
  compact: 'p-4 sm:p-6',
  default: 'p-6',
  loose: 'p-6 sm:p-8',
}

export const ResponsiveCard = React.memo(function ResponsiveCard({
  children,
  className,
  title,
  description,
  padding = 'default',
  showHeader = true,
  footer,
  layout = 'auto',
  ...props
}: ResponsiveCardProps) {
  return (
    <Card
      className={cn(
        padding !== 'default' && paddingClasses[padding],
        layout === 'auto' && 'flex flex-col sm:flex-row',
        className
      )}
      {...props}
    >
      {showHeader && (title || description) && (
        <CardHeader className={cn(
          layout === 'auto' && 'sm:w-1/3',
          padding === 'tight' && 'p-3 sm:p-4',
          padding === 'compact' && 'p-4 sm:p-6',
        )}>
          {title && <CardTitle className="text-lg sm:text-xl">{title}</CardTitle>}
          {description && (
            <CardDescription className="text-xs sm:text-sm mt-1">
              {description}
            </CardDescription>
          )}
        </CardHeader>
      )}
      <CardContent className={cn(
        layout === 'auto' && 'sm:flex-1',
        padding === 'tight' && 'p-3 sm:p-4',
        padding === 'compact' && 'p-4 sm:p-6',
      )}>
        {children}
      </CardContent>
      {footer && (
        <CardFooter className={cn(
          layout === 'auto' && 'sm:w-full',
          padding === 'tight' && 'p-3 sm:p-4',
          padding === 'compact' && 'p-4 sm:p-6',
        )}>
          {footer}
        </CardFooter>
      )}
    </Card>
  )
})

/**
 * Responsive Card Grid
 * Grid of cards with responsive columns
 */
interface CardGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Number of columns at different breakpoints
   */
  cols?: {
    sm?: number
    md?: number
    lg?: number
    xl?: number
  }
  /**
   * Gap between cards
   */
  gap?: 'tight' | 'compact' | 'default' | 'loose'
}

const cardGridColsMap: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  12: 'grid-cols-12',
}

const cardGridColsMapMd: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-6',
  12: 'md:grid-cols-12',
}

const cardGridColsMapLg: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
  12: 'lg:grid-cols-12',
}

const cardGridColsMapXl: Record<number, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
  12: 'xl:grid-cols-12',
}

export const CardGrid = React.memo(function CardGrid({
  children,
  className,
  cols = { sm: 1, md: 2, lg: 3 },
  gap = 'default',
  ...props
}: CardGridProps) {
  const gridCols = [
    cols.sm && cardGridColsMap[cols.sm],
    cols.md && cardGridColsMapMd[cols.md],
    cols.lg && cardGridColsMapLg[cols.lg],
    cols.xl && cardGridColsMapXl[cols.xl],
  ].filter(Boolean).join(' ')

  const gapClasses = {
    tight: 'gap-2 sm:gap-3',
    compact: 'gap-3 sm:gap-4',
    default: 'gap-4 sm:gap-6',
    loose: 'gap-6 sm:gap-8',
  }

  return (
    <div
      className={cn(
        'grid',
        gridCols || 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
        gapClasses[gap],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
