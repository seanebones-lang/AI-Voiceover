import { isVoiceResponse, isVoice, type Voice } from '@/lib/types/voice'

describe('Voice Type Guards', () => {
  describe('isVoice', () => {
    it('validates correct voice object', () => {
      const voice: Voice = {
        voice_id: 'voice-1',
        name: 'Test Voice',
        language: 'en',
        source: 'system',
      }

      expect(isVoice(voice)).toBe(true)
    })

    it('rejects invalid voice object', () => {
      expect(isVoice(null)).toBe(false)
      expect(isVoice({})).toBe(false)
      expect(isVoice({ voice_id: 'test' })).toBe(false)
      expect(isVoice({ voice_id: 'test', name: 'Test' })).toBe(false)
    })

    it('rejects wrong types', () => {
      expect(isVoice('string')).toBe(false)
      expect(isVoice(123)).toBe(false)
      expect(isVoice([])).toBe(false)
    })
  })

  describe('isVoiceResponse', () => {
    it('validates correct voice response', () => {
      const response = {
        voices: [
          {
            voice_id: 'voice-1',
            name: 'Test Voice',
            language: 'en',
            source: 'system',
          },
        ],
      }

      expect(isVoiceResponse(response)).toBe(true)
    })

    it('rejects invalid response', () => {
      expect(isVoiceResponse(null)).toBe(false)
      expect(isVoiceResponse({})).toBe(false)
      expect(isVoiceResponse({ voices: 'not-array' })).toBe(false)
      expect(isVoiceResponse({ voices: [] })).toBe(true) // Empty array is valid
    })
  })
})
