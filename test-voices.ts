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

async function main() {
  const results: Array<{ voiceId: string; status: string; bytes?: number; ms?: number; reason?: string }> = []

  for (const voiceId of VOICE_IDS) {
    process.stdout.write(`Testing ${voiceId}... `)
    try {
      const start = Date.now()
      const buf = await synthesizeEdge({ text: 'Hello, this is a test.', voiceId })
      const ms = Date.now() - start
      if (buf && buf.length > 0) {
        results.push({ voiceId, status: 'PASS', bytes: buf.length, ms })
        console.log(`PASS (${buf.length} bytes, ${ms}ms)`)
      } else {
        results.push({ voiceId, status: 'FAIL', reason: 'empty buffer' })
        console.log('FAIL (empty buffer)')
      }
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err)
      results.push({ voiceId, status: 'FAIL', reason })
      console.log(`FAIL: ${reason}`)
    }
  }

  const pass = results.filter(r => r.status === 'PASS').length
  const fail = results.filter(r => r.status === 'FAIL').length
  console.log(`\nTotal: ${pass} PASS, ${fail} FAIL out of ${results.length}`)
  process.exit(fail > 0 ? 1 : 0)
}

main()
