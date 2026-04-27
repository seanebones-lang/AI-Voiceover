import { NextResponse } from 'next/server'
import { config, getServiceUrl, withRetry } from '@/lib/config'


// Force dynamic rendering
export const dynamic = 'force-dynamic'

let clonedVoicesUnavailableLogged = false

interface Voice {
  voice_id: string
  name: string
  language?: string
  gender?: string
  source: string
  category: string
  description?: string
}

// Default voices using edge-tts (Microsoft TTS) - Expanded with high-quality voices
const DEFAULT_VOICES: Voice[] = [
  // English US - Male
  {
    voice_id: 'default_english',
    name: 'Guy (US English)',
    language: 'en',
    gender: 'male',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural US English male voice'
  },
  {
    voice_id: 'male_us_aria',
    name: 'Aria (US English)',
    language: 'en',
    gender: 'male',
    source: 'edge-tts',
    category: 'standard',
    description: 'Professional US English male voice'
  },
  {
    voice_id: 'male_us_davis',
    name: 'Davis (US English)',
    language: 'en',
    gender: 'male',
    source: 'edge-tts',
    category: 'standard',
    description: 'Warm US English male voice'
  },
  // English US - Female
  {
    voice_id: 'female_english',
    name: 'Jenny (US English)',
    language: 'en',
    gender: 'female',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural US English female voice'
  },
  {
    voice_id: 'female_us_aria',
    name: 'Aria (US English - Female)',
    language: 'en',
    gender: 'female',
    source: 'edge-tts',
    category: 'standard',
    description: 'Professional US English female voice'
  },
  {
    voice_id: 'female_us_amber',
    name: 'Amber (US English)',
    language: 'en',
    gender: 'female',
    source: 'edge-tts',
    category: 'standard',
    description: 'Clear US English female voice'
  },
  // English British - Male
  {
    voice_id: 'male_british',
    name: 'Ryan (British)',
    language: 'en',
    gender: 'male',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural British English male voice'
  },
  {
    voice_id: 'male_british_libby',
    name: 'Libby (British)',
    language: 'en',
    gender: 'male',
    source: 'edge-tts',
    category: 'standard',
    description: 'Professional British English male voice'
  },
  // English British - Female
  {
    voice_id: 'female_british',
    name: 'Sonia (British)',
    language: 'en',
    gender: 'female',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural British English female voice'
  },
  {
    voice_id: 'female_british_libby',
    name: 'Libby (British - Female)',
    language: 'en',
    gender: 'female',
    source: 'edge-tts',
    category: 'standard',
    description: 'Professional British English female voice'
  },
  // Spanish
  {
    voice_id: 'default_spanish',
    name: 'Alvaro (Spanish)',
    language: 'es',
    gender: 'male',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural Spanish male voice'
  },
  {
    voice_id: 'spanish_female',
    name: 'Elvira (Spanish)',
    language: 'es',
    gender: 'female',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural Spanish female voice'
  },
  // French
  {
    voice_id: 'default_french',
    name: 'Henri (French)',
    language: 'fr',
    gender: 'male',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural French male voice'
  },
  {
    voice_id: 'french_female',
    name: 'Denise (French)',
    language: 'fr',
    gender: 'female',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural French female voice'
  },
  // German
  {
    voice_id: 'default_german',
    name: 'Conrad (German)',
    language: 'de',
    gender: 'male',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural German male voice'
  },
  {
    voice_id: 'german_female',
    name: 'Katja (German)',
    language: 'de',
    gender: 'female',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural German female voice'
  },
  // Portuguese
  {
    voice_id: 'default_portuguese',
    name: 'Antonio (Portuguese)',
    language: 'pt',
    gender: 'male',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural Brazilian Portuguese male voice'
  },
  {
    voice_id: 'portuguese_female',
    name: 'Francisca (Portuguese)',
    language: 'pt',
    gender: 'female',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural Brazilian Portuguese female voice'
  },
  // Italian
  {
    voice_id: 'italian_male',
    name: 'Diego (Italian)',
    language: 'it',
    gender: 'male',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural Italian male voice'
  },
  {
    voice_id: 'italian_female',
    name: 'Elsa (Italian)',
    language: 'it',
    gender: 'female',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural Italian female voice'
  },
  // Japanese
  {
    voice_id: 'japanese_male',
    name: 'Keita (Japanese)',
    language: 'ja',
    gender: 'male',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural Japanese male voice'
  },
  {
    voice_id: 'japanese_female',
    name: 'Nanami (Japanese)',
    language: 'ja',
    gender: 'female',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural Japanese female voice'
  },
  // Chinese
  {
    voice_id: 'chinese_male',
    name: 'Yunyang (Chinese)',
    language: 'zh',
    gender: 'male',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural Chinese male voice'
  },
  {
    voice_id: 'chinese_female',
    name: 'Xiaoxiao (Chinese)',
    language: 'zh',
    gender: 'female',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural Chinese female voice'
  },
  // Korean
  {
    voice_id: 'korean_male',
    name: 'InJoon (Korean)',
    language: 'ko',
    gender: 'male',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural Korean male voice'
  },
  {
    voice_id: 'korean_female',
    name: 'SunHi (Korean)',
    language: 'ko',
    gender: 'female',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural Korean female voice'
  }
]

async function getClonedVoices(): Promise<{ voices: Voice[]; error?: string }> {
  if (config.isRailway && !config.xttsConfigured) {
    return { voices: [], error: 'XTTS not configured' }
  }
  const timeoutMs = 5000 // Fail fast when XTTS is not running (e.g. local dev)
  try {
    const response = await withRetry(async () => {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetch(`${getServiceUrl('xtts')}/voices`, {
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            'User-Agent': 'NextEleven-VoiceAPI/1.0',
          },
        })
        clearTimeout(t)
        return res
      } catch (e) {
        clearTimeout(t)
        throw e
      }
    }, 2, 1000, 1.5)

    if (response.ok) {
      const data = await response.json().catch(() => ({ voices: [] }))
      const voices = (data.voices || []).map((v: { voice_id?: string; name?: string; description?: string }) => ({
        voice_id: v.voice_id,
        name: v.name || v.voice_id,
        language: 'multilingual',
        source: 'cloned',
        category: 'cloned',
        description: v.description || 'Custom cloned voice'
      }))
      return { voices }
    }
    return { voices: [], error: `XTTS returned ${response.status}` }
  } catch (error) {
    if (!clonedVoicesUnavailableLogged) {
      clonedVoicesUnavailableLogged = true
      console.log('Cloned voices service not available:', error instanceof Error ? error.message : 'Unknown error')
    }
    return {
      voices: [],
      error: error instanceof Error ? error.message : 'Cloned voices service unreachable',
    }
  }
}

export async function GET() {
  const { voices: clonedVoices, error: clonedError } = await getClonedVoices()
  const allVoices = [...DEFAULT_VOICES, ...clonedVoices]

  return NextResponse.json({
    voices: allVoices,
    default_count: DEFAULT_VOICES.length,
    cloned_count: clonedVoices.length,
    ...(clonedError
      ? { degraded: true, degraded_reason: clonedError }
      : {}),
  })
}
