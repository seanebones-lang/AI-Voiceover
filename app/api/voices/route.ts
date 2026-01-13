import { NextResponse } from 'next/server'

// Force dynamic rendering to avoid onnxruntime-node loading at build time
export const dynamic = 'force-dynamic'

// Lazy import to avoid loading onnxruntime-node at build time
async function getPiperTTS() {
  const { PiperTTS } = await import('@/lib/tts/piper')
  return PiperTTS
}

export async function GET() {
  try {
    const PiperTTS = await getPiperTTS()
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
