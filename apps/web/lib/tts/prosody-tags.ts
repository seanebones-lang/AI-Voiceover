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
 * (pauses become 0.25 / 0.5 / 0.9 s of real silence in the voice service)
 */
export function parseProsodyTags(text: string): ProsodyTagParseResult {
  if (!text) return { cleanText: text, adjustments: { ...DEFAULT_ADJUSTMENTS } }

  let speedDelta = 0
  let pitchDelta = 0

  const emphCount = (text.match(/\[emph\]/gi) || []).length
  const strongCount = (text.match(/\[strong\]/gi) || []).length
  const questionCount = (text.match(/\[question\]/gi) || []).length

  speedDelta += emphCount * 0.02
  pitchDelta += emphCount * 0.6

  speedDelta += strongCount * 0.04
  pitchDelta += strongCount * 1.0

  pitchDelta += questionCount * 0.8

  const cleanText = text
    .replace(/\[(\/)?(emph|strong|question)\]/gi, '')
    // Pauses stay as canonical markers; the voice service renders them as real silence.
    .replace(/\[pause(?::(short|medium|long))?\]/gi, (_m, kind?: string) => ` [pause:${(kind || 'medium').toLowerCase()}] `)
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()

  return {
    cleanText,
    adjustments: {
      speedDelta: clamp(speedDelta, -0.18, 0.22),
      pitchDelta: clamp(pitchDelta, -6, 8),
      reverbDelta: 0,
    },
  }
}
