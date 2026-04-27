import { applyEmotionProsody } from '@/lib/tts/emotion-prosody'

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
