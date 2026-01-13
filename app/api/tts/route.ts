import { NextRequest, NextResponse } from 'next/server'
import { PiperTTS, PiperTTS as Piper } from '@/lib/tts/piper'
import { ttsRateLimiter } from '@/lib/rate-limit'

// Cache for TTS instances
const ttsInstances = new Map<string, PiperTTS>()

interface TTSRequest {
  text: string
  voice_id: string
  speed?: number
  pitch?: number
  volume?: number
}

function getTTSInstance(voiceId: string): PiperTTS | null {
  if (ttsInstances.has(voiceId)) {
    return ttsInstances.get(voiceId)!
  }

  const voices = PiperTTS.getAvailableVoices()
  const voice = voices.find(v => v.id === voiceId)
  
  if (!voice) {
    return null
  }

  const tts = new PiperTTS(voiceId, voice.modelPath)
  ttsInstances.set(voiceId, tts)
  return tts
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
    const { text, voice_id, speed = 1.0, pitch = 0, volume = 1.0 } = body

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

    // Get TTS instance
    const tts = getTTSInstance(voice_id)
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
    const startTime = Date.now()
    const audioBuffer = await tts.synthesize(text, { speed, pitch, volume })
    const latency = Date.now() - startTime

    // Create WAV file with header
    const wavBuffer = PiperTTS.createWAVHeader(audioBuffer, 22050)

    console.log(`✓ TTS generated: ${text.substring(0, 50)}... (${latency}ms)`)

    // Return audio as stream
    return new NextResponse(wavBuffer, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Disposition': `attachment; filename="voiceover-${Date.now()}.wav"`,
        'Content-Length': wavBuffer.length.toString(),
        'X-Generation-Latency': latency.toString(),
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
