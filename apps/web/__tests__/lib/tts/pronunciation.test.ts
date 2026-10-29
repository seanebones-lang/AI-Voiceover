import { applyPronunciationOverrides } from '@/lib/tts/pronunciation'

describe('applyPronunciationOverrides', () => {
  it('applies rules in one pass so a rule never rewrites another rule’s output', () => {
    expect(
      applyPronunciationOverrides('NextEleven and nexteleven-ai; Eleven', { NextEleven: 'Next Eleven', Eleven: '11' })
    ).toBe('Next Eleven and Next Eleven-ai; 11')
  })

  it('matches whole words only, including non-ASCII words', () => {
    expect(applyPronunciationOverrides('café cafés SQL', { café: 'ka-FAY', SQL: 'sequel' })).toBe('ka-FAY cafés sequel')
  })

  it('leaves IPA markup untouched for the voice service', () => {
    expect(applyPronunciationOverrides('route [ipa:route|ruːt]', { route: 'root' })).toBe('root [ipa:route|ruːt]')
  })
})
