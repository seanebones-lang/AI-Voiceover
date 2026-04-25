'use client'

/**
 * Responsive Grid Component
 * Flexible grid system with responsive columns
 */
import React from 'react'
import { cn } from '@/lib/utils'

interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Number of columns at different breakpoints
   * Format: { sm?: number, md?: number, lg?: number, xl?: number }
   * Default: 1 column on mobile, 2 on md, 3 on lg
   */
  cols?: {
    sm?: number
    md?: number
    lg?: number
    xl?: number
  }
  /**
   * Gap between grid items
   * - tight: gap-2
   * - compact: gap-3
   * - default: gap-4
   * - loose: gap-6
   */
  gap?: 'tight' | 'compact' | 'default' | 'loose'
  /**
   * Equal height items
   */
  equalHeight?: boolean
}

const gapClasses = {
  tight: 'gap-2 sm:gap-3',
  compact: 'gap-3 sm:gap-4',
  default: 'gap-4 sm:gap-6',
  loose: 'gap-6 sm:gap-8',
}

const gridColsMap: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  12: 'grid-cols-12',
}

const gridColsMapMd: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-6',
  12: 'md:grid-cols-12',
}

const gridColsMapLg: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
  12: 'lg:grid-cols-12',
}

const gridColsMapXl: Record<number, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
  12: 'xl:grid-cols-12',
}

export const Grid = React.memo(function Grid({
  children,
  className,
  cols = { sm: 1, md: 2, lg: 3 },
  gap = 'default',
  equalHeight = false,
  ...props
}: GridProps) {
  const gridCols = [
    cols.sm && gridColsMap[cols.sm],
    cols.md && gridColsMapMd[cols.md],
    cols.lg && gridColsMapLg[cols.lg],
    cols.xl && gridColsMapXl[cols.xl],
  ].filter(Boolean).join(' ')

  return (
    <div
      className={cn(
        'grid',
        gridCols || 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
        gapClasses[gap],
        equalHeight && 'items-stretch',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})

/**
 * Responsive Stack Component
 * Vertical stacking with responsive spacing
 */
interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Spacing between items
   * - tight: space-y-2
   * - compact: space-y-3
   * - default: space-y-4
   * - loose: space-y-6
   */
  spacing?: 'tight' | 'compact' | 'default' | 'loose'
  /**
   * Horizontal alignment
   */
  align?: 'start' | 'center' | 'end' | 'stretch'
  /**
   * Vertical alignment
   */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around'
}

const spacingClasses = {
  tight: 'space-y-2 sm:space-y-3',
  compact: 'space-y-3 sm:space-y-4',
  default: 'space-y-4 sm:space-y-6',
  loose: 'space-y-6 sm:space-y-8',
}

const stackAlignMap: Record<string, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
}

const stackJustifyMap: Record<string, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
}

export const Stack = React.memo(function Stack({
  children,
  className,
  spacing = 'default',
  align = 'stretch',
  justify = 'start',
  ...props
}: StackProps) {
  return (
    <div
      className={cn(
        'flex flex-col',
        spacingClasses[spacing],
        stackAlignMap[align],
        stackJustifyMap[justify],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})

/**
 * Responsive Flex Component
 * Horizontal flex container with responsive behavior
 */
interface FlexProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Direction
   */
  direction?: 'row' | 'col' | 'row-reverse' | 'col-reverse'
  /**
   * Wrap behavior
   */
  wrap?: boolean
  /**
   * Gap between items
   */
  gap?: 'tight' | 'compact' | 'default' | 'loose'
  /**
   * Horizontal alignment
   */
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline'
  /**
   * Vertical alignment
   */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
  /**
   * Responsive direction (mobile first)
   */
  responsive?: {
    sm?: 'row' | 'col'
    md?: 'row' | 'col'
    lg?: 'row' | 'col'
  }
}

const flexGapClasses = {
  tight: 'gap-2 sm:gap-3',
  compact: 'gap-3 sm:gap-4',
  default: 'gap-4 sm:gap-6',
  loose: 'gap-6 sm:gap-8',
}

const flexDirectionMap: Record<string, string> = {
  row: 'flex-row',
  col: 'flex-col',
  'row-reverse': 'flex-row-reverse',
  'col-reverse': 'flex-col-reverse',
}

const flexResponsiveMap: Record<string, Record<string, string>> = {
  sm: {
    row: 'flex-row',
    col: 'flex-col',
  },
  md: {
    row: 'md:flex-row',
    col: 'md:flex-col',
  },
  lg: {
    row: 'lg:flex-row',
    col: 'lg:flex-col',
  },
}

const alignMap: Record<string, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
}

const justifyMap: Record<string, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
}

export const Flex = React.memo(function Flex({
  children,
  className,
  direction = 'row',
  wrap = false,
  gap = 'default',
  align = 'center',
  justify = 'start',
  responsive,
  ...props
}: FlexProps) {
  const directionClasses = responsive
    ? [
        responsive.sm && flexResponsiveMap.sm[responsive.sm],
        responsive.md && flexResponsiveMap.md[responsive.md],
        responsive.lg && flexResponsiveMap.lg[responsive.lg],
      ].filter(Boolean).join(' ')
    : flexDirectionMap[direction]

  return (
    <div
      className={cn(
        'flex',
        directionClasses,
        wrap && 'flex-wrap',
        flexGapClasses[gap],
        alignMap[align],
        justifyMap[justify],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
