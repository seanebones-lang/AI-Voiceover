import { NextResponse } from 'next/server'
import { PiperTTS } from '@/lib/tts/piper'

// Force dynamic rendering to avoid onnxruntime-node loading at build time
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const voices = PiperTTS.getAvailableVoices()
    
    return NextResponse.json({
      voices: voices.map(v => ({
        voice_id: v.id,
        name: v.name,
        language: v.language,
        gender: v.gender,
        source: 'piper',
        category: 'premium',
      })),
    })
  } catch (error) {
    console.error('Error fetching voices:', error)
    return NextResponse.json(
      { error: 'Failed to fetch voices' },
      { status: 500 }
    )
  }
}
