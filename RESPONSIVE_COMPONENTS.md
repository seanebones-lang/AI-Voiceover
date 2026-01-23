# Responsive Components System

**Date:** January 22, 2026  
**Status:** ✅ **Complete**

---

## Overview

A comprehensive responsive component system built with Tailwind CSS and React, following mobile-first design principles. All components are fully responsive, accessible, and optimized for performance.

---

## Components

### 1. Container

Responsive container with max-width and padding controls.

```tsx
import { Container } from '@/components/responsive'

<Container maxWidth="2xl" padding="default">
  {children}
</Container>
```

**Props:**
- `maxWidth`: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' (default: '2xl')
- `padding`: 'none' | 'tight' | 'compact' | 'default' | 'loose' (default: 'default')
- `center`: boolean (default: true)

**Breakpoints:**
- sm: 640px
- md: 768px
- lg: 1024px
- xl: 1280px
- 2xl: 1400px

---

### 2. Grid

Flexible grid system with responsive columns.

```tsx
import { Grid } from '@/components/responsive'

<Grid cols={{ sm: 1, md: 2, lg: 3 }} gap="default">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</Grid>
```

**Props:**
- `cols`: { sm?: number, md?: number, lg?: number, xl?: number }
- `gap`: 'tight' | 'compact' | 'default' | 'loose'
- `equalHeight`: boolean

---

### 3. Stack

Vertical stacking with responsive spacing.

```tsx
import { Stack } from '@/components/responsive'

<Stack spacing="default" align="center">
  <div>Item 1</div>
  <div>Item 2</div>
</Stack>
```

**Props:**
- `spacing`: 'tight' | 'compact' | 'default' | 'loose'
- `align`: 'start' | 'center' | 'end' | 'stretch'
- `justify`: 'start' | 'center' | 'end' | 'between' | 'around'

---

### 4. Flex

Horizontal flex container with responsive behavior.

```tsx
import { Flex } from '@/components/responsive'

<Flex 
  direction="row" 
  gap="default"
  responsive={{ sm: 'col', md: 'row' }}
>
  <div>Item 1</div>
  <div>Item 2</div>
</Flex>
```

**Props:**
- `direction`: 'row' | 'col' | 'row-reverse' | 'col-reverse'
- `wrap`: boolean
- `gap`: 'tight' | 'compact' | 'default' | 'loose'
- `align`: 'start' | 'center' | 'end' | 'stretch' | 'baseline'
- `justify`: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
- `responsive`: { sm?: 'row' | 'col', md?: 'row' | 'col', lg?: 'row' | 'col' }

---

### 5. ResponsiveCard

Card with responsive padding and layout.

```tsx
import { ResponsiveCard } from '@/components/responsive'

<ResponsiveCard
  title="Card Title"
  description="Card description"
  padding="default"
  layout="auto"
>
  {children}
</ResponsiveCard>
```

**Props:**
- `title`: string
- `description`: string
- `padding`: 'tight' | 'compact' | 'default' | 'loose'
- `showHeader`: boolean
- `footer`: React.ReactNode
- `layout`: 'stack' | 'auto'

---

### 6. CardGrid

Grid of cards with responsive columns.

```tsx
import { CardGrid } from '@/components/responsive'

<CardGrid cols={{ sm: 1, md: 2, lg: 3 }} gap="default">
  <ResponsiveCard>Card 1</ResponsiveCard>
  <ResponsiveCard>Card 2</ResponsiveCard>
  <ResponsiveCard>Card 3</ResponsiveCard>
</CardGrid>
```

**Props:**
- `cols`: { sm?: number, md?: number, lg?: number, xl?: number }
- `gap`: 'tight' | 'compact' | 'default' | 'loose'

---

### 7. Section

Semantic section with responsive spacing.

```tsx
import { Section } from '@/components/responsive'

<Section
  title="Section Title"
  description="Section description"
  padding="default"
  variant="default"
>
  {children}
</Section>
```

**Props:**
- `title`: string
- `description`: string
- `padding`: 'none' | 'tight' | 'compact' | 'default' | 'loose'
- `container`: boolean
- `maxWidth`: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
- `variant`: 'default' | 'muted' | 'accent'

---

### 8. Hide / Show

Show or hide content at specific breakpoints.

```tsx
import { Hide, Show } from '@/components/responsive'

{/* Hide on mobile, show on desktop */}
<Hide breakpoint="md" above={false}>
  Mobile only content
</Hide>

<Show breakpoint="md" above={true}>
  Desktop only content
</Show>
```

**Props:**
- `breakpoint`: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
- `above`: boolean (show above breakpoint)
- `below`: boolean (show below breakpoint)

---

### 9. ResponsiveText

Text with responsive sizing.

```tsx
import { ResponsiveText } from '@/components/responsive'

<ResponsiveText size="lg" weight="semibold" color="accent">
  Responsive text
</ResponsiveText>
```

**Props:**
- `size`: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'
- `weight`: 'normal' | 'medium' | 'semibold' | 'bold'
- `color`: 'default' | 'muted' | 'accent' | 'white'

---

## Usage Examples

### Example 1: Responsive Dashboard Layout

```tsx
import { Container, Grid, ResponsiveCard } from '@/components/responsive'

export function Dashboard() {
  return (
    <Container maxWidth="7xl" padding="default">
      <Grid cols={{ sm: 1, md: 2, lg: 3 }} gap="default">
        <ResponsiveCard title="Card 1" padding="default">
          Content 1
        </ResponsiveCard>
        <ResponsiveCard title="Card 2" padding="default">
          Content 2
        </ResponsiveCard>
        <ResponsiveCard title="Card 3" padding="default">
          Content 3
        </ResponsiveCard>
      </Grid>
    </Container>
  )
}
```

### Example 2: Responsive Hero Section

```tsx
import { Section, ResponsiveText, Flex } from '@/components/responsive'

export function Hero() {
  return (
    <Section
      title="Welcome"
      description="Your description here"
      padding="loose"
      variant="accent"
    >
      <Flex direction="col" gap="default" align="center">
        <ResponsiveText size="4xl" weight="bold" color="white">
          Main Heading
        </ResponsiveText>
        <ResponsiveText size="lg" color="muted">
          Subheading text
        </ResponsiveText>
      </Flex>
    </Section>
  )
}
```

### Example 3: Mobile-First Navigation

```tsx
import { Flex, Hide, Show } from '@/components/responsive'

export function Navigation() {
  return (
    <Flex direction="row" justify="between" align="center">
      <Logo />
      
      {/* Desktop menu */}
      <Show breakpoint="md" above={true}>
        <DesktopMenu />
      </Show>
      
      {/* Mobile menu */}
      <Hide breakpoint="md" above={false}>
        <MobileMenuButton />
      </Hide>
    </Flex>
  )
}
```

---

## Responsive Breakpoints

| Breakpoint | Min Width | Usage |
|------------|-----------|-------|
| sm | 640px | Small tablets |
| md | 768px | Tablets |
| lg | 1024px | Small desktops |
| xl | 1280px | Desktops |
| 2xl | 1400px | Large desktops |

---

## Best Practices

1. **Mobile-First**: Always design for mobile first, then enhance for larger screens
2. **Consistent Spacing**: Use the spacing variants (tight, compact, default, loose) consistently
3. **Semantic HTML**: Use semantic elements (section, article, etc.) when appropriate
4. **Accessibility**: All components include proper ARIA attributes
5. **Performance**: All components are memoized with React.memo

---

## Integration with Design System

These components integrate seamlessly with the existing design system:

```tsx
import { Container, ResponsiveCard } from '@/components/responsive'
import { spacing, radius, shadows } from '@/lib/design-system'

<Container>
  <ResponsiveCard
    className={`${radius.card} ${shadows.card}`}
    padding="default"
  >
    Content
  </ResponsiveCard>
</Container>
```

---

## Files Created

1. `components/responsive/container.tsx` - Container component
2. `components/responsive/grid.tsx` - Grid, Stack, Flex components
3. `components/responsive/card-responsive.tsx` - ResponsiveCard, CardGrid
4. `components/responsive/section.tsx` - Section component
5. `components/responsive/hide-show.tsx` - Hide, Show, ResponsiveText
6. `components/responsive/index.ts` - Barrel export

---

## Testing

All components are:
- ✅ Fully responsive (tested at all breakpoints)
- ✅ Accessible (ARIA compliant)
- ✅ Memoized (React.memo for performance)
- ✅ Type-safe (TypeScript)
- ✅ Consistent (follows design system)

---

## Next Steps

1. Integrate responsive components into existing pages
2. Update dashboard-v2.tsx to use responsive components
3. Update playground page to use responsive components
4. Add responsive utilities to design system
5. Create responsive component examples/storybook

---

## Conclusion

The responsive component system provides a solid foundation for building mobile-first, accessible, and performant user interfaces. All components follow best practices and integrate seamlessly with the existing design system.
