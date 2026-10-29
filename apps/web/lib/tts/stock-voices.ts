/**
 * Stock voices served by the self-hosted voice service (services/xtts).
 * Mirrors services/xtts/stock_voices.json (the service's source of truth); a jest test keeps
 * the two in sync. Legacy IDs from the old Microsoft Edge voices are kept so saved settings
 * and API clients keep working.
 *
 * engine 'kokoro' = Kokoro-82M (fast, CPU-friendly); engine 'xtts' = XTTS v2 studio speakers
 * (slower on CPU, same limits as cloned voices).
 */

export type StockVoiceEngine = 'kokoro' | 'xtts'

export interface StockVoice {
  voice_id: string
  name: string
  /** ISO 639-1 code, or 'multilingual' for XTTS studio voices that speak every XTTS language. */
  language: string
  gender: 'male' | 'female'
  engine: StockVoiceEngine
  description: string
}

export const STOCK_VOICES: readonly StockVoice[] = [
  { voice_id: 'female_english', name: 'Heart (US English)', language: 'en', gender: 'female', engine: 'kokoro', description: 'Warm, natural US English female voice (recommended)' },
  { voice_id: 'female_us_aria', name: 'Bella (US English)', language: 'en', gender: 'female', engine: 'kokoro', description: 'Bright, expressive US English female voice' },
  { voice_id: 'female_us_amber', name: 'Nicole (US English)', language: 'en', gender: 'female', engine: 'kokoro', description: 'Soft, intimate US English female voice' },
  { voice_id: 'us_female_sarah', name: 'Sarah (US English)', language: 'en', gender: 'female', engine: 'kokoro', description: 'Clear, conversational US English female voice' },
  { voice_id: 'us_female_aoede', name: 'Aoede (US English)', language: 'en', gender: 'female', engine: 'kokoro', description: 'Smooth US English female narration voice' },
  { voice_id: 'default_english', name: 'Michael (US English)', language: 'en', gender: 'male', engine: 'kokoro', description: 'Steady, friendly US English male voice' },
  { voice_id: 'male_us_aria', name: 'Fenrir (US English)', language: 'en', gender: 'male', engine: 'kokoro', description: 'Deep, confident US English male voice' },
  { voice_id: 'male_us_davis', name: 'Puck (US English)', language: 'en', gender: 'male', engine: 'kokoro', description: 'Lively, upbeat US English male voice' },
  { voice_id: 'female_british', name: 'Emma (British)', language: 'en', gender: 'female', engine: 'kokoro', description: 'Polished British English female voice' },
  { voice_id: 'female_british_libby', name: 'Isabella (British)', language: 'en', gender: 'female', engine: 'kokoro', description: 'Warm British English female voice' },
  { voice_id: 'male_british', name: 'George (British)', language: 'en', gender: 'male', engine: 'kokoro', description: 'Classic British English male voice' },
  { voice_id: 'male_british_libby', name: 'Fable (British)', language: 'en', gender: 'male', engine: 'kokoro', description: 'Storyteller British English male voice' },
  { voice_id: 'default_spanish', name: 'Alex (Spanish)', language: 'es', gender: 'male', engine: 'kokoro', description: 'Natural Spanish male voice' },
  { voice_id: 'spanish_female', name: 'Dora (Spanish)', language: 'es', gender: 'female', engine: 'kokoro', description: 'Natural Spanish female voice' },
  { voice_id: 'default_french', name: 'Zacharie (French)', language: 'fr', gender: 'male', engine: 'xtts', description: 'French male studio voice' },
  { voice_id: 'french_female', name: 'Siwis (French)', language: 'fr', gender: 'female', engine: 'kokoro', description: 'Natural French female voice' },
  { voice_id: 'default_german', name: 'Viktor (German)', language: 'de', gender: 'male', engine: 'xtts', description: 'German male studio voice' },
  { voice_id: 'german_female', name: 'Henriette (German)', language: 'de', gender: 'female', engine: 'xtts', description: 'German female studio voice' },
  { voice_id: 'default_portuguese', name: 'Alex (Portuguese)', language: 'pt', gender: 'male', engine: 'kokoro', description: 'Brazilian Portuguese male voice' },
  { voice_id: 'portuguese_female', name: 'Dora (Portuguese)', language: 'pt', gender: 'female', engine: 'kokoro', description: 'Brazilian Portuguese female voice' },
  { voice_id: 'italian_male', name: 'Nicola (Italian)', language: 'it', gender: 'male', engine: 'kokoro', description: 'Natural Italian male voice' },
  { voice_id: 'italian_female', name: 'Sara (Italian)', language: 'it', gender: 'female', engine: 'kokoro', description: 'Natural Italian female voice' },
  { voice_id: 'japanese_male', name: 'Kumo (Japanese)', language: 'ja', gender: 'male', engine: 'kokoro', description: 'Natural Japanese male voice' },
  { voice_id: 'japanese_female', name: 'Alpha (Japanese)', language: 'ja', gender: 'female', engine: 'kokoro', description: 'Natural Japanese female voice' },
  { voice_id: 'chinese_male', name: 'Yunxi (Chinese)', language: 'zh', gender: 'male', engine: 'kokoro', description: 'Natural Mandarin Chinese male voice' },
  { voice_id: 'chinese_female', name: 'Xiaoxiao (Chinese)', language: 'zh', gender: 'female', engine: 'kokoro', description: 'Natural Mandarin Chinese female voice' },
  { voice_id: 'korean_male', name: 'Royston (Korean)', language: 'ko', gender: 'male', engine: 'xtts', description: 'Korean male studio voice' },
  { voice_id: 'korean_female', name: 'Sofia (Korean)', language: 'ko', gender: 'female', engine: 'xtts', description: 'Korean female studio voice' },
  { voice_id: 'hindi_female', name: 'Alpha (Hindi)', language: 'hi', gender: 'female', engine: 'kokoro', description: 'Natural Hindi female voice' },
  { voice_id: 'hindi_male', name: 'Omega (Hindi)', language: 'hi', gender: 'male', engine: 'kokoro', description: 'Natural Hindi male voice' },
  { voice_id: 'studio_claribel', name: 'Claribel (Studio, multilingual)', language: 'multilingual', gender: 'female', engine: 'xtts', description: 'XTTS studio voice; speaks any of the 17 XTTS languages' },
  { voice_id: 'studio_daisy', name: 'Daisy (Studio, multilingual)', language: 'multilingual', gender: 'female', engine: 'xtts', description: 'XTTS studio voice; speaks any of the 17 XTTS languages' },
  { voice_id: 'studio_andrew', name: 'Andrew (Studio, multilingual)', language: 'multilingual', gender: 'male', engine: 'xtts', description: 'XTTS studio voice; speaks any of the 17 XTTS languages' },
  { voice_id: 'studio_damien', name: 'Damien (Studio, multilingual)', language: 'multilingual', gender: 'male', engine: 'xtts', description: 'XTTS studio voice; speaks any of the 17 XTTS languages' },
]

const BY_ID = new Map(STOCK_VOICES.map((v) => [v.voice_id, v]))

export function getStockVoice(voiceId: string): StockVoice | undefined {
  return BY_ID.get(voiceId)
}

export function isStockVoice(voiceId: string): boolean {
  return BY_ID.has(voiceId)
}

/** Voices rendered by XTTS (cloned voices and studio speakers): slower, tighter per-request limits. */
export function isXttsVoice(voiceId: string): boolean {
  return voiceId.startsWith('clone_') || BY_ID.get(voiceId)?.engine === 'xtts'
}
