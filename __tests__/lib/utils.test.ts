import { cn } from '@/lib/utils'

describe('Utils', () => {
  describe('cn (className utility)', () => {
    it('merges class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar')
    })

    it('handles conditional classes', () => {
      expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
    })

    it('handles undefined and null', () => {
      expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
    })

    it('handles empty strings', () => {
      expect(cn('foo', '', 'bar')).toBe('foo bar')
    })

    it('handles Tailwind merge conflicts', () => {
      // Should merge conflicting classes (e.g., p-2 and p-4 -> p-4)
      const result = cn('p-2', 'p-4')
      expect(result).toContain('p-4')
      expect(result).not.toContain('p-2')
    })
  })
})
