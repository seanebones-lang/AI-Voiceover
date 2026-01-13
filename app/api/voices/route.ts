import { NextResponse } from 'next/server'

// Force dynamic rendering to avoid onnxruntime-node loading at build time
export const dynamic = 'force-dynamic'

const XTTS_URL = process.env.XTTS_SIDECAR_URL || 'http://localhost:8081'

// Lazy import to avoid loading onnxruntime-node at build time
async function getPiperTTS() {
  const { PiperTTS } = await import('@/lib/tts/piper')
  return PiperTTS
}

async function getClonedVoices() {
  try {
    const response = await fetch(`${XTTS_URL}/voices`, {
      cache: 'no-store'
    })
    if (response.ok) {
      const data = await response.json()
      return data.voices || []
    }
  } catch (error) {
    console.log('Cloned voices service not available')
  }
  return []
}

export async function GET() {
  try {
    // Get Piper TTS voices
    let piperVoices: any[] = []
    try {
      const PiperTTS = await getPiperTTS()
      piperVoices = PiperTTS.getAvailableVoices().map(v => ({
        voice_id: v.id,
        name: v.name,
        language: v.language,
        gender: v.gender,
        source: 'piper',
        category: 'premium',
      }))
    } catch (error) {
      console.log('Piper voices not available:', error)
    }
    
    // Get cloned voices from XTTS sidecar
    const clonedVoices = await getClonedVoices()
    const formattedClonedVoices = clonedVoices.map((v: any) => ({
      voice_id: v.voice_id,
      name: `🎤 ${v.name} (Cloned)`,
      language: 'multilingual',
      gender: 'custom',
      source: 'cloned',
      category: 'cloned',
      description: v.description,
    }))
    
    // Combine all voices
    const allVoices = [...formattedClonedVoices, ...piperVoices]
    
    return NextResponse.json({
      voices: allVoices,
      cloned_count: formattedClonedVoices.length,
      piper_count: piperVoices.length,
    })
  } catch (error) {
    console.error('Error fetching voices:', error)
    return NextResponse.json(
      { voices: [], error: 'Failed to fetch voices' },
      { status: 200 } // Return 200 with empty array so UI doesn't break
    )
  }
}
