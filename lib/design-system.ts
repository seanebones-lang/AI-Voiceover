/**
 * Design System Tokens
 * Centralized design tokens for pixel-perfect consistency
 * 
 * Usage:
 * import { spacing, radius, shadows, glass } from '@/lib/design-system'
 * 
 * className={`${spacing.card} ${radius.card} ${glass.card}`}
 */

export const spacing = {
  // Component padding
  card: 'p-6',
  cardCompact: 'p-4',
  cardTight: 'p-3',
  section: 'p-6',
  sectionCompact: 'p-4',
  
  // Input padding
  input: 'px-4 py-3',
  inputCompact: 'px-3 py-2',
  inputTight: 'px-2 py-1.5',
  
  // Button padding
  button: 'px-4 py-2',
  buttonCompact: 'px-3 py-1.5',
  buttonLarge: 'px-6 py-3',
  
  // Gaps
  gap: 'gap-4',
  gapCompact: 'gap-3',
  gapTight: 'gap-2',
  gapLoose: 'gap-6',
  
  // Vertical spacing
  stack: 'space-y-4',
  stackCompact: 'space-y-3',
  stackTight: 'space-y-2',
  stackLoose: 'space-y-6',
} as const

export const radius = {
  // Card radius
  card: 'rounded-xl',        // 12px - primary card radius
  cardLarge: 'rounded-2xl',  // 16px - hero cards
  cardCompact: 'rounded-lg', // 8px - compact cards
  
  // Input radius
  input: 'rounded-lg',       // 8px - inputs, selects
  inputLarge: 'rounded-xl',  // 12px - large inputs
  
  // Button radius
  button: 'rounded-lg',      // 8px - buttons
  buttonPill: 'rounded-full', // full - pill buttons
  
  // Badge/icon radius
  badge: 'rounded-md',       // 6px - badges, small elements
  icon: 'rounded-lg',        // 8px - icon containers
} as const

export const shadows = {
  // Card shadows
  card: 'shadow-lg',         // Standard card elevation
  cardHover: 'shadow-xl',    // Hover state
  cardSubtle: 'shadow-md',   // Subtle elevation
  
  // Button shadows
  button: 'shadow-md',
  buttonHover: 'shadow-lg',
  buttonPrimary: 'shadow-lg shadow-purple-500/25',
  
  // Modal/overlay shadows
  modal: 'shadow-2xl',
  dropdown: 'shadow-xl',
  
  // Glow effects
  glow: 'shadow-lg shadow-purple-500/25',
  glowHover: 'shadow-xl shadow-purple-500/40',
} as const

export const glass = {
  // Glassmorphism effects
  card: 'bg-slate-900/50 border border-slate-800 backdrop-blur',
  cardSubtle: 'bg-slate-900/30 border border-slate-700/50 backdrop-blur-sm',
  cardStrong: 'bg-slate-900/70 border border-slate-800 backdrop-blur-md',
  
  // Playground glass (lighter background)
  playground: 'bg-white/[0.03] border border-white/10 backdrop-blur-sm',
  playgroundStrong: 'bg-white/[0.05] border border-white/20 backdrop-blur',
  
  // Input glass
  input: 'bg-slate-800/50 border border-slate-700',
  inputPlayground: 'bg-black/30 border border-white/10',
} as const

export const typography = {
  // Headings
  h1: 'text-4xl font-bold tracking-tight',
  h2: 'text-3xl font-bold tracking-tight',
  h3: 'text-2xl font-semibold',
  h4: 'text-xl font-semibold',
  h5: 'text-lg font-medium',
  h6: 'text-base font-medium',
  
  // Body text
  body: 'text-base',
  bodySmall: 'text-sm',
  bodyLarge: 'text-lg',
  
  // Labels
  label: 'text-sm font-medium',
  labelSmall: 'text-xs font-medium',
  
  // Muted text
  muted: 'text-sm text-muted-foreground',
  mutedSmall: 'text-xs text-muted-foreground',
} as const

export const transitions = {
  // Standard transitions
  default: 'transition-all duration-200 ease-out',
  fast: 'transition-all duration-150 ease-out',
  slow: 'transition-all duration-300 ease-out',
  
  // Specific transitions
  colors: 'transition-colors duration-200',
  transform: 'transition-transform duration-200',
  opacity: 'transition-opacity duration-200',
} as const

export const focus = {
  // Focus rings
  ring: 'focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-slate-950',
  ringSubtle: 'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
  ringStrong: 'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2',
} as const

// Color palette (for reference, use Tailwind classes in practice)
export const colors = {
  // Primary gradient
  gradientPrimary: 'bg-gradient-to-r from-purple-600 to-cyan-600',
  gradientPrimaryHover: 'hover:from-purple-500 hover:to-cyan-500',
  
  // Accent gradients
  gradientAccent: 'bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-600',
  gradientAccentHover: 'hover:from-purple-500 hover:via-pink-500 hover:to-cyan-500',
  
  // Text colors (WCAG AAA compliant)
  textPrimary: 'text-white',
  textSecondary: 'text-slate-300',
  textMuted: 'text-slate-400',
  textSubtle: 'text-slate-500',
} as const

// Component variants
export const variants = {
  // Card variants
  card: {
    default: `${spacing.card} ${radius.card} ${glass.card} ${shadows.card}`,
    compact: `${spacing.cardCompact} ${radius.cardCompact} ${glass.card} ${shadows.cardSubtle}`,
    playground: `${spacing.card} ${radius.cardLarge} ${glass.playground}`,
  },
  
  // Button variants (extends ui/button.tsx)
  button: {
    primary: `${spacing.button} ${radius.button} ${shadows.buttonPrimary} ${transitions.colors}`,
    secondary: `${spacing.button} ${radius.button} ${shadows.button} ${transitions.colors}`,
    outline: `${spacing.button} ${radius.button} ${transitions.colors}`,
  },
  
  // Input variants
  input: {
    default: `${spacing.input} ${radius.input} ${glass.input} ${focus.ring}`,
    compact: `${spacing.inputCompact} ${radius.input} ${glass.input} ${focus.ring}`,
    playground: `${spacing.input} ${radius.inputLarge} ${glass.inputPlayground} ${focus.ring}`,
  },
} as const

// Export all as a single object for easy importing
export const designSystem = {
  spacing,
  radius,
  shadows,
  glass,
  typography,
  transitions,
  focus,
  colors,
  variants,
} as const
