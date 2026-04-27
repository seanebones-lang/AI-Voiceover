import { applyEmotionProsody, applyExpressiveCopyProsody } from '@/lib/tts/emotion-prosody'

describe('applyEmotionProsody', () => {
  const base = {
    speed: 1,
    pitch: 0,
    volume: 1,
    reverb: 0,
    echo: 0,
    noise_reduction: false,
    special_effect: 'none',
  }

  it('leaves neutral unchanged', () => {
    const o = applyEmotionProsody(base, 'neutral')
    expect(o).toEqual(base)
  })

  it('increases speed and pitch for excited', () => {
    const o = applyEmotionProsody(base, 'excited')
    expect(o.speed).toBeGreaterThan(1)
    expect(o.pitch).toBeGreaterThan(0)
  })

  it('sets whisper special_effect when none selected', () => {
    const o = applyEmotionProsody(base, 'whisper')
    expect(o.special_effect).toBe('whisper')
    expect(o.volume).toBeLessThan(1)
  })

  it('does not override explicit special_effect for whisper emotion', () => {
    const o = applyEmotionProsody({ ...base, special_effect: 'robot' }, 'whisper')
    expect(o.special_effect).toBe('robot')
  })
})

describe('applyExpressiveCopyProsody', () => {
  const base = {
    speed: 1,
    pitch: 0,
    volume: 1,
    reverb: 0,
    echo: 0,
    noise_reduction: false,
    special_effect: 'none',
  }

  it('keeps base prosody when disabled', () => {
    expect(applyExpressiveCopyProsody(base, 'Hello!', { enabled: false })).toEqual(base)
  })

  it('adds energetic lift for exclamation and question punctuation', () => {
    const out = applyExpressiveCopyProsody(base, 'Wait! Is this live?!', {
      enabled: true,
      intensity: 'balanced',
      isClonedVoice: false,
    })
    expect(out.speed).toBeGreaterThanOrEqual(1)
    expect(out.pitch).toBeGreaterThan(0)
  })

  it('applies smaller deltas for cloned voices to protect identity', () => {
    const standard = applyExpressiveCopyProsody(base, 'This is AMAZING!!!', {
      enabled: true,
      intensity: 'dramatic',
      isClonedVoice: false,
    })
    const cloned = applyExpressiveCopyProsody(base, 'This is AMAZING!!!', {
      enabled: true,
      intensity: 'dramatic',
      isClonedVoice: true,
    })
    expect(cloned.pitch).toBeLessThan(standard.pitch)
  })
})
