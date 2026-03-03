import { getXaiVoices, isValidXaiVoice } from '@/lib/xaiTtsService'

describe('xAI TTS', () => {
  it('returns 5 voices', () => {
    const voices = getXaiVoices()
    expect(voices).toHaveLength(5)
    expect(voices.map((v) => v.voice_id)).toEqual(['Eve', 'Ara', 'Rex', 'Sal', 'Leo'])
  })

  it('validates xAI voice ids', () => {
    expect(isValidXaiVoice('Eve')).toBe(true)
    expect(isValidXaiVoice('Rex')).toBe(true)
    expect(isValidXaiVoice('unknown')).toBe(false)
  })
})
