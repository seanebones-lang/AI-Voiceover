describe('tts cache byte budget', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env.TTS_CACHE_MAX_MB = '16'
  })
  afterAll(() => {
    delete process.env.TTS_CACHE_MAX_MB
  })

  it('evicts least-recently-used entries to stay under the byte budget', async () => {
    const { setCached, getCached, cacheStats } = await import('@/lib/tts-cache')
    const mb = (n: number) => new ArrayBuffer(n * 1024 * 1024)
    for (let i = 0; i < 12; i++) setCached(`k${i}`, mb(1.9), 'audio/wav')
    const stats = cacheStats()
    expect(stats.bytes).toBeLessThanOrEqual(stats.maxBytes)
    expect(getCached('k0')).toBeNull()
    expect(getCached('k11')).not.toBeNull()
  })

  it('skips entries larger than an eighth of the budget and replaces duplicates cleanly', async () => {
    const { setCached, getCached, cacheStats } = await import('@/lib/tts-cache')
    setCached('big', new ArrayBuffer(3 * 1024 * 1024), 'audio/wav')
    expect(getCached('big')).toBeNull()
    setCached('a', new ArrayBuffer(1000), 'audio/wav')
    setCached('a', new ArrayBuffer(2000), 'audio/mpeg')
    expect(cacheStats()).toMatchObject({ entries: 1, bytes: 2000 })
    expect(getCached('a')?.contentType).toBe('audio/mpeg')
  })
})

describe('tts cache voice invalidation', () => {
  it('changes the key for a voice after invalidateVoice', async () => {
    jest.resetModules()
    const { buildTtsCacheKey, invalidateVoice } = await import('@/lib/tts-cache')
    const params = {
      text: 'hi', voice_id: 'clone_a_1', language: 'en', speed: 1, pitch: 0, volume: 1,
      reverb: 0, echo: 0, noise_reduction: false, special_effect: 'none',
    }
    const before = buildTtsCacheKey(params)
    const other = buildTtsCacheKey({ ...params, voice_id: 'female_english' })
    invalidateVoice('clone_a_1')
    expect(buildTtsCacheKey(params)).not.toBe(before)
    expect(buildTtsCacheKey({ ...params, voice_id: 'female_english' })).toBe(other)
  })
})
