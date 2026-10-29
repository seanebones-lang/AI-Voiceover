import fs from 'node:fs'
import path from 'node:path'
import { STOCK_VOICES, getStockVoice, isStockVoice, isXttsVoice } from '@/lib/tts/stock-voices'

type ServiceVoice = { voice_id: string; name: string; language: string; gender: string; engine: string }

const serviceCatalog: ServiceVoice[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../../../services/xtts/stock_voices.json'), 'utf8')
).voices

describe('stock voice catalog', () => {
  it('matches the voice service catalog exactly (ids, names, languages, engines)', () => {
    const pick = (v: ServiceVoice) => ({
      voice_id: v.voice_id,
      name: v.name,
      language: v.language,
      gender: v.gender,
      engine: v.engine,
    })
    expect(STOCK_VOICES.map(pick)).toEqual(serviceCatalog.map(pick))
  })

  it('keeps the legacy voice ids so saved settings keep working', () => {
    for (const id of ['default_english', 'female_english', 'male_british', 'female_british', 'default_spanish',
      'default_french', 'default_german', 'default_portuguese', 'japanese_female', 'chinese_male', 'korean_female']) {
      expect(isStockVoice(id)).toBe(true)
    }
  })

  it('has unique ids', () => {
    const ids = STOCK_VOICES.map((v) => v.voice_id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('classifies XTTS-backed voices for limits and timeouts', () => {
    expect(isXttsVoice('clone_me_abc123')).toBe(true)
    expect(isXttsVoice('default_german')).toBe(true)
    expect(isXttsVoice('studio_claribel')).toBe(true)
    expect(isXttsVoice('female_english')).toBe(false)
    expect(isXttsVoice('unknown_voice')).toBe(false)
    expect(getStockVoice('female_english')?.engine).toBe('kokoro')
  })
})
