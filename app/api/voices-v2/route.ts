/**
 * Voices API Route (v2)
 * Lists all available voices from HumanMirage TTS
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || 'http://localhost:8082'

interface Voice {
  voice_id: string
  name: string
  description?: string
  source: 'cloned' | 'default'
  language?: string
  created_at?: string
}

// Default voices (fallback if service unavailable)
const DEFAULT_VOICES: Voice[] = [
  {
    voice_id: 'default_male',
    name: 'Default Male',
    description: 'Natural male voice',
    source: 'default',
    language: 'en',
  },
  {
    voice_id: 'default_female',
    name: 'Default Female',
    description: 'Natural female voice',
    source: 'default',
    language: 'en',
  },
]

export async function GET() {
  try {
    // Try to get voices from TTS service
    const response = await fetch(`${TTS_SERVICE_URL}/voices`, {
      cache: 'no-store',
    })

    if (response.ok) {
      const data = await response.json()
      const voices = data.voices || []
      
      return NextResponse.json({
        voices,
        count: voices.length,
        service: 'humanmirage-v3',
      })
    }

    // Fallback to defaults
    console.warn('TTS service unavailable, using default voices')
    return NextResponse.json({
      voices: DEFAULT_VOICES,
      count: DEFAULT_VOICES.length,
      service: 'fallback',
    })
  } catch (error) {
    console.error('Voices route error:', error)
    
    // Return defaults on error
    return NextResponse.json({
      voices: DEFAULT_VOICES,
      count: DEFAULT_VOICES.length,
      service: 'fallback',
      error: 'TTS service unavailable',
    })
  }
}
