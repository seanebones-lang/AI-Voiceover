import { NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const XTTS_URL = process.env.XTTS_SIDECAR_URL || 'http://localhost:8081'

interface Voice {
  voice_id: string
  name: string
  language?: string
  gender?: string
  source: string
  category: string
  description?: string
}

// Default voices using edge-tts (Microsoft TTS)
const DEFAULT_VOICES: Voice[] = [
  // English voices
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
    voice_id: 'female_english',
    name: 'Jenny (US English)',
    language: 'en',
    gender: 'female',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural US English female voice'
  },
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
    voice_id: 'female_british',
    name: 'Sonia (British)',
    language: 'en',
    gender: 'female',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural British English female voice'
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
  // Portuguese
  {
    voice_id: 'default_portuguese',
    name: 'Antonio (Portuguese)',
    language: 'pt',
    gender: 'male',
    source: 'edge-tts',
    category: 'standard',
    description: 'Natural Brazilian Portuguese male voice'
  }
]

async function getClonedVoices(): Promise<Voice[]> {
  try {
    const response = await fetch(`${XTTS_URL}/voices`, {
      cache: 'no-store'
    })
    if (response.ok) {
      const data = await response.json()
      return (data.voices || []).map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name || v.voice_id,
        language: 'multilingual',
        source: 'cloned',
        category: 'cloned',
        description: v.description || 'Custom cloned voice'
      }))
    }
  } catch (error) {
    console.log('Cloned voices service not available')
  }
  return []
}

export async function GET() {
  try {
    // Get cloned voices from sidecar
    const clonedVoices = await getClonedVoices()
    
    // Combine default voices with cloned voices
    const allVoices = [...DEFAULT_VOICES, ...clonedVoices]

    return NextResponse.json({
      voices: allVoices,
      default_count: DEFAULT_VOICES.length,
      cloned_count: clonedVoices.length
    })
  } catch (error) {
    console.error('Error fetching voices:', error)
    // Return at least the default voices on error
    return NextResponse.json({
      voices: DEFAULT_VOICES,
      default_count: DEFAULT_VOICES.length,
      cloned_count: 0
    })
  }
}
