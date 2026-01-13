import { NextRequest, NextResponse } from 'next/server'
import { ttsRateLimiter } from '@/lib/rate-limit'

// Force dynamic rendering to avoid onnxruntime-node loading at build time
export const dynamic = 'force-dynamic'

const XTTS_URL = process.env.XTTS_SIDECAR_URL || 'http://localhost:8081'

// Lazy import to avoid loading onnxruntime-node at build time
async function getPiperTTS() {
  const { PiperTTS } = await import('@/lib/tts/piper')
  return PiperTTS
}

// Cache for TTS instances - use any to avoid importing the type at build time
const ttsInstances = new Map<string, any>()

interface TTSRequest {
  text: string
  voice_id: string
  speed?: number
  pitch?: number
  volume?: number
  language?: string
}

async function getTTSInstance(voiceId: string): Promise<any | null> {
  if (ttsInstances.has(voiceId)) {
    return ttsInstances.get(voiceId)!
  }

  const PiperTTS = await getPiperTTS()
  const voices = PiperTTS.getAvailableVoices()
  const voice = voices.find(v => v.id === voiceId)
  
  if (!voice) {
    return null
  }

  const tts = new PiperTTS(voiceId, voice.modelPath)
  ttsInstances.set(voiceId, tts)
  return tts
}

// Generate TTS using cloned voice via XTTS sidecar
async function generateClonedVoiceTTS(text: string, voiceId: string, language: string = 'en') {
  const response = await fetch(`${XTTS_URL}/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      language,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'TTS generation failed' }))
    throw new Error(error.detail || 'Failed to generate cloned voice TTS')
  }

  return response
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1'
    const { success, limit, remaining, reset } = await ttsRateLimiter.limit(ip)
    
    if (!success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          limit,
          remaining,
          reset: new Date(reset).toISOString(),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
          },
        }
      )
    }

    const body: TTSRequest = await request.json()
    const { text, voice_id, speed = 1.0, pitch = 0, volume = 1.0, language = 'en' } = body

    // Validation
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Valid text is required' },
        { status: 400 }
      )
    }

    if (text.length > 5000) {
      return NextResponse.json(
        { error: 'Text must be 5,000 characters or less' },
        { status: 400 }
      )
    }

    if (!voice_id) {
      return NextResponse.json(
        { error: 'voice_id is required' },
        { status: 400 }
      )
    }

    const startTime = Date.now()

    // Check if this is a cloned voice (starts with "clone_")
    if (voice_id.startsWith('clone_')) {
      console.log(`🎤 Using cloned voice: ${voice_id}`)
      
      try {
        const xttsResponse = await generateClonedVoiceTTS(text, voice_id, language)
        const audioBuffer = await xttsResponse.arrayBuffer()
        const latency = Date.now() - startTime

        console.log(`✓ Cloned voice TTS generated: ${text.substring(0, 50)}... (${latency}ms)`)

        return new NextResponse(audioBuffer, {
          headers: {
            'Content-Type': 'audio/wav',
            'Content-Disposition': `attachment; filename="cloned-voiceover-${Date.now()}.wav"`,
            'Content-Length': audioBuffer.byteLength.toString(),
            'X-Generation-Latency': latency.toString(),
            'X-Voice-Type': 'cloned',
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': (remaining - 1).toString(),
            'X-RateLimit-Reset': reset.toString(),
          },
        })
      } catch (error) {
        console.error('Cloned voice TTS error:', error)
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to generate cloned voice audio' },
          { status: 500 }
        )
      }
    }

    // Otherwise, use Piper TTS for standard voices
    const tts = await getTTSInstance(voice_id)
    if (!tts) {
      return NextResponse.json(
        { error: `Voice not found: ${voice_id}` },
        { status: 404 }
      )
    }

    // Ensure initialized
    if (!tts['session']) {
      await tts['initialize']()
    }

    // Synthesize speech
    const PiperTTS = await getPiperTTS()
    const audioBuffer = await tts.synthesize(text, { speed, pitch, volume })
    const latency = Date.now() - startTime

    // Create WAV file with header
    const wavBuffer = PiperTTS.createWAVHeader(audioBuffer, 22050)

    console.log(`✓ TTS generated: ${text.substring(0, 50)}... (${latency}ms)`)

    // Return audio as stream (convert Buffer to Uint8Array for Next.js 15 compatibility)
    return new NextResponse(new Uint8Array(wavBuffer), {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Disposition': `attachment; filename="voiceover-${Date.now()}.wav"`,
        'Content-Length': wavBuffer.length.toString(),
        'X-Generation-Latency': latency.toString(),
        'X-Voice-Type': 'piper',
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': (remaining - 1).toString(),
        'X-RateLimit-Reset': reset.toString(),
      },
    })
  } catch (error) {
    console.error('TTS generation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate speech' },
      { status: 500 }
    )
  }
}
