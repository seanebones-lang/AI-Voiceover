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

// Default built-in voices from YourTTS/XTTS
const DEFAULT_VOICES: Voice[] = [
  {
    voice_id: 'default_english',
    name: 'Default English',
    language: 'en',
    gender: 'neutral',
    source: 'yourtts',
    category: 'standard',
    description: 'Default YourTTS English voice'
  },
  {
    voice_id: 'default_spanish',
    name: 'Default Spanish',
    language: 'es',
    gender: 'neutral',
    source: 'yourtts',
    category: 'standard',
    description: 'Default YourTTS Spanish voice'
  },
  {
    voice_id: 'default_french',
    name: 'Default French',
    language: 'fr',
    gender: 'neutral',
    source: 'yourtts',
    category: 'standard',
    description: 'Default YourTTS French voice'
  },
  {
    voice_id: 'default_german',
    name: 'Default German',
    language: 'de',
    gender: 'neutral',
    source: 'yourtts',
    category: 'standard',
    description: 'Default YourTTS German voice'
  },
  {
    voice_id: 'default_portuguese',
    name: 'Default Portuguese',
    language: 'pt',
    gender: 'neutral',
    source: 'yourtts',
    category: 'standard',
    description: 'Default YourTTS Portuguese voice'
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
