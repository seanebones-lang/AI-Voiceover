import { synthesizeEdge } from './lib/edgeTtsService'

const VOICE_IDS = [
  'default_english', 'male_us_aria', 'male_us_davis',
  'female_english', 'female_us_aria', 'female_us_amber',
  'male_british', 'male_british_libby', 'female_british', 'female_british_libby',
  'default_spanish', 'spanish_female',
  'default_french', 'french_female',
  'default_german', 'german_female',
  'default_portuguese', 'portuguese_female',
  'italian_male', 'italian_female',
  'japanese_male', 'japanese_female',
  'chinese_male', 'chinese_female',
  'korean_male', 'korean_female',
]

const results: Array<{ voiceId: string; status: string; bytes?: number; ms?: number; reason?: string }> = []

for (const voiceId of VOICE_IDS) {
  try {
    const start = Date.now()
    const buf = await synthesizeEdge({ text: 'Hello, this is a test.', voiceId })
    const ms = Date.now() - start
    if (buf && buf.length > 0) {
      results.push({ voiceId, status: 'PASS', bytes: buf.length, ms })
    } else {
      results.push({ voiceId, status: 'FAIL', reason: 'empty buffer' })
    }
  } catch (err: unknown) {
    results.push({ voiceId, status: 'FAIL', reason: err instanceof Error ? err.message : String(err) })
  }
}

const pass = results.filter(r => r.status === 'PASS')
const fail = results.filter(r => r.status === 'FAIL')
console.log(`\nPASS: ${pass.length}/${results.length}`)
pass.forEach(r => console.log(`  ✓ ${r.voiceId} (${r.bytes} bytes, ${r.ms}ms)`))
if (fail.length) {
  console.log(`\nFAIL: ${fail.length}`)
  fail.forEach(r => console.log(`  ✗ ${r.voiceId}: ${r.reason}`))
}
