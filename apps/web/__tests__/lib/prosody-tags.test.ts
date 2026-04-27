import { parseProsodyTags } from '@/lib/tts/prosody-tags'

describe('parseProsodyTags', () => {
  it('returns same text without tags', () => {
    const out = parseProsodyTags('Hello world.')
    expect(out.cleanText).toBe('Hello world.')
    expect(out.adjustments.speedDelta).toBe(0)
  })

  it('parses emph/strong/question tags and strips markup', () => {
    const out = parseProsodyTags('[emph]Hello[/emph] [strong]now[/strong] [question]ready[/question]')
    expect(out.cleanText).toBe('Hello now ready')
    expect(out.adjustments.speedDelta).toBeGreaterThan(0)
    expect(out.adjustments.pitchDelta).toBeGreaterThan(0)
  })

  it('converts pause tags into pauses and lowers speed', () => {
    const out = parseProsodyTags('Start [pause:long] then continue')
    expect(out.cleanText).toContain('—')
    expect(out.adjustments.speedDelta).toBeLessThan(0)
  })
})
