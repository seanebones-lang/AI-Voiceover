'use client'

/**
 * Responsive Hide/Show Components
 * Show or hide content at specific breakpoints
 */
import React from 'react'
import { cn } from '@/lib/utils'

interface HideShowProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Breakpoint to show/hide at
   */
  breakpoint?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  /**
   * Show above breakpoint (default: true)
   */
  above?: boolean
  /**
   * Show below breakpoint
   */
  below?: boolean
}

/**
 * Hide component - hides content at specified breakpoint
 */
const breakpointHideMap: Record<string, Record<string, string>> = {
  sm: {
    above: 'hidden sm:block',
    below: 'block sm:hidden',
  },
  md: {
    above: 'hidden md:block',
    below: 'block md:hidden',
  },
  lg: {
    above: 'hidden lg:block',
    below: 'block lg:hidden',
  },
  xl: {
    above: 'hidden xl:block',
    below: 'block xl:hidden',
  },
  '2xl': {
    above: 'hidden 2xl:block',
    below: 'block 2xl:hidden',
  },
}

export const Hide = React.memo(function Hide({
  children,
  className,
  breakpoint = 'md',
  above = false,
  ...props
}: HideShowProps) {
  const hideClasses = breakpointHideMap[breakpoint]?.[above ? 'above' : 'below'] || 'hidden'

  return (
    <div className={cn(hideClasses, className)} {...props}>
      {children}
    </div>
  )
})

/**
 * Show component - shows content at specified breakpoint
 */
export const Show = React.memo(function Show({
  children,
  className,
  breakpoint = 'md',
  above = true,
  ...props
}: HideShowProps) {
  const showClasses = breakpointHideMap[breakpoint]?.[above ? 'above' : 'below'] || 'block'

  return (
    <div className={cn(showClasses, className)} {...props}>
      {children}
    </div>
  )
})

/**
 * Responsive Text Component
 * Text with responsive sizing
 */
interface ResponsiveTextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  /**
   * Size variant
   */
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'
  /**
   * Weight variant
   */
  weight?: 'normal' | 'medium' | 'semibold' | 'bold'
  /**
   * Color variant
   */
  color?: 'default' | 'muted' | 'accent' | 'white'
}

const sizeClasses = {
  xs: 'text-xs',
  sm: 'text-xs sm:text-sm',
  base: 'text-sm sm:text-base',
  lg: 'text-base sm:text-lg',
  xl: 'text-lg sm:text-xl',
  '2xl': 'text-xl sm:text-2xl',
  '3xl': 'text-2xl sm:text-3xl',
  '4xl': 'text-3xl sm:text-4xl',
}

const weightClasses = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
}

const colorClasses = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  accent: 'text-purple-400',
  white: 'text-white',
}

export const ResponsiveText = React.memo(function ResponsiveText({
  children,
  className,
  size = 'base',
  weight = 'normal',
  color = 'default',
  ...props
}: ResponsiveTextProps) {
  return (
    <p
      className={cn(
        sizeClasses[size],
        weightClasses[weight],
        colorClasses[color],
        className
      )}
      {...props}
    >
      {children}
    </p>
  )
})
