/**
 * Whole-word pronunciation overrides, applied in a single pass (longest source wins) so one
 * rule never rewrites another rule's output. `[ipa:word|phonemes]` markup is left in place:
 * the voice service renders it as inline phonemes for Kokoro voices and as the plain word
 * for XTTS.
 */
export function applyPronunciationOverrides(text: string, overrides?: Record<string, string>): string {
  if (!overrides) return text
  const pairs = new Map<string, string>()
  for (const [rawSource, rawTarget] of Object.entries(overrides)) {
    const source = rawSource.trim()
    const target = rawTarget.trim()
    if (source && target) pairs.set(source.toLowerCase(), target)
  }
  if (pairs.size === 0) return text
  const alternation = [...pairs.keys()]
    .sort((a, b) => b.length - a.length)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(${alternation})(?![\\p{L}\\p{N}_])`, 'giu')
  // Leave explicit [ipa:word|phonemes] markup untouched; it already says how to pronounce it.
  return text
    .split(/(\[ipa:[^\]]+\])/i)
    .map((part) => (/^\[ipa:/i.test(part) ? part : part.replace(pattern, (m) => pairs.get(m.toLowerCase()) ?? m)))
    .join('')
}
