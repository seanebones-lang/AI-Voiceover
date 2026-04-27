/**
 * Maps UI "emotion" presets to TTS prosody (speed, pitch, levels, optional special_effect).
 * Applied on the server after validation so all clients get consistent behavior.
 */

export const ttsEmotionIds = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'excited',
  'calm',
  'whisper',
  'serious',
] as const

export type TtsEmotionId = (typeof ttsEmotionIds)[number]

export type EmotionProsodyInput = {
  speed: number
  pitch: number
  volume: number
  reverb: number
  echo: number
  noise_reduction: boolean
  special_effect: string
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function isKnownEmotion(e: string): e is TtsEmotionId {
  return (ttsEmotionIds as readonly string[]).includes(e)
}

/**
 * Layer emotion on top of user/base TTS params. Explicit `special_effect` wins unless
 * emotion is `whisper` and the user left effect as `none` (then we set whisper filter).
 */
export function applyEmotionProsody(
  base: EmotionProsodyInput,
  emotion: string | undefined
): EmotionProsodyInput {
  const raw = (emotion || 'neutral').toLowerCase()
  if (!isKnownEmotion(raw) || raw === 'neutral') {
    return { ...base }
  }

  let speed = base.speed
  let pitch = base.pitch
  let volume = base.volume
  let reverb = base.reverb
  let echo = base.echo
  let noise_reduction = base.noise_reduction
  let special_effect = base.special_effect

  switch (raw) {
    case 'happy':
      speed += 0.07
      pitch += 3
      volume = clamp(volume + 0.04, 0.15, 1)
      break
    case 'sad':
      speed -= 0.11
      pitch -= 5
      volume = clamp(volume - 0.06, 0.35, 1)
      break
    case 'angry':
      speed += 0.09
      pitch += 2
      echo = clamp(echo + 0.06, 0, 1)
      break
    case 'excited':
      speed += 0.15
      pitch += 5
      volume = clamp(volume + 0.03, 0.15, 1)
      break
    case 'calm':
      speed -= 0.07
      pitch -= 2
      reverb = clamp(reverb + 0.1, 0, 1)
      noise_reduction = true
      break
    case 'whisper':
      speed -= 0.05
      pitch -= 2
      volume = clamp(volume * 0.88, 0.35, 0.95)
      if (special_effect === 'none') special_effect = 'whisper'
      break
    case 'serious':
      speed -= 0.05
      pitch -= 3
      break
    default:
      break
  }

  return {
    speed: clamp(speed, 0.5, 2.0),
    pitch: clamp(pitch, -20, 20),
    volume: clamp(volume, 0, 1),
    reverb: clamp(reverb, 0, 1),
    echo: clamp(echo, 0, 1),
    noise_reduction,
    special_effect,
  }
}
