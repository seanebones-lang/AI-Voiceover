import { validateTTSRequest, CLONED_TTS_MAX_CHARS, STANDARD_TTS_MAX_CHARS } from '@/lib/validation'

describe('TTS validation — clone vs standard limits', () => {
  it('allows long text for standard voices up to STANDARD_TTS_MAX_CHARS', () => {
    const r = validateTTSRequest({
      text: 'a'.repeat(STANDARD_TTS_MAX_CHARS),
      voice_id: 'default_english',
    })
    expect(r.success).toBe(true)
  })

  it('rejects standard voice text over STANDARD_TTS_MAX_CHARS', () => {
    const r = validateTTSRequest({
      text: 'a'.repeat(STANDARD_TTS_MAX_CHARS + 1),
      voice_id: 'default_english',
    })
    expect(r.success).toBe(false)
  })

  it('allows cloned voice text up to CLONED_TTS_MAX_CHARS', () => {
    const r = validateTTSRequest({
      text: 'a'.repeat(CLONED_TTS_MAX_CHARS),
      voice_id: 'clone_demo_abc123',
    })
    expect(r.success).toBe(true)
  })

  it('rejects cloned voice text over CLONED_TTS_MAX_CHARS', () => {
    const r = validateTTSRequest({
      text: 'a'.repeat(CLONED_TTS_MAX_CHARS + 1),
      voice_id: 'clone_demo_abc123',
    })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/Cloned voice text must/)
  })

  it('accepts optional emotion presets', () => {
    const r = validateTTSRequest({
      text: 'Hello',
      voice_id: 'default_english',
      emotion: 'excited',
    })
    expect(r.success).toBe(true)
    expect(r.data?.emotion).toBe('excited')
  })

  it('defaults emotion to neutral', () => {
    const r = validateTTSRequest({
      text: 'Hello',
      voice_id: 'default_english',
    })
    expect(r.success).toBe(true)
    expect(r.data?.emotion).toBe('neutral')
  })

  it('rejects unknown emotion', () => {
    const r = validateTTSRequest({
      text: 'Hello',
      voice_id: 'default_english',
      emotion: 'furious',
    })
    expect(r.success).toBe(false)
  })
})
