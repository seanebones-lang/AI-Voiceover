export type ProsodyTagAdjustments = {
  speedDelta: number
  pitchDelta: number
  reverbDelta: number
}

export type ProsodyTagParseResult = {
  cleanText: string
  adjustments: ProsodyTagAdjustments
}

const DEFAULT_ADJUSTMENTS: ProsodyTagAdjustments = {
  speedDelta: 0,
  pitchDelta: 0,
  reverbDelta: 0,
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/**
 * SSML-lite deterministic controls:
 * [emph]...[/emph], [strong]...[/strong], [question]...[/question], [pause], [pause:short|medium|long]
 */
export function parseProsodyTags(text: string): ProsodyTagParseResult {
  if (!text) return { cleanText: text, adjustments: { ...DEFAULT_ADJUSTMENTS } }

  let speedDelta = 0
  let pitchDelta = 0
  let reverbDelta = 0

  const emphCount = (text.match(/\[emph\]/gi) || []).length
  const strongCount = (text.match(/\[strong\]/gi) || []).length
  const questionCount = (text.match(/\[question\]/gi) || []).length
  const pauseShort = (text.match(/\[pause:short\]/gi) || []).length
  const pauseMedium = (text.match(/\[pause(?::medium)?\]/gi) || []).length
  const pauseLong = (text.match(/\[pause:long\]/gi) || []).length

  speedDelta += emphCount * 0.02
  pitchDelta += emphCount * 0.6

  speedDelta += strongCount * 0.04
  pitchDelta += strongCount * 1.0

  pitchDelta += questionCount * 0.8

  speedDelta -= pauseShort * 0.01
  speedDelta -= pauseMedium * 0.02
  speedDelta -= pauseLong * 0.03
  reverbDelta += (pauseMedium + pauseLong) * 0.02

  const cleanText = text
    .replace(/\[(\/)?(emph|strong|question)\]/gi, '')
    .replace(/\[pause(?::short|:medium|:long)?\]/gi, ' — ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    cleanText,
    adjustments: {
      speedDelta: clamp(speedDelta, -0.18, 0.22),
      pitchDelta: clamp(pitchDelta, -6, 8),
      reverbDelta: clamp(reverbDelta, 0, 0.2),
    },
  }
}
