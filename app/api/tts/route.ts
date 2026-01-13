import { NextRequest, NextResponse } from 'next/server'
import { ttsRateLimiter } from '@/lib/rate-limit'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const XTTS_URL = process.env.XTTS_SIDECAR_URL || 'http://localhost:8081'

interface TTSRequest {
  text: string
  voice_id: string
  speed?: number
  pitch?: number
  volume?: number
  language?: string
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
    const { text, voice_id, language = 'en' } = body

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

    console.log(`🎤 Generating TTS: voice=${voice_id}, text="${text.substring(0, 50)}..."`)
    
    // All TTS goes through the Python sidecar (YourTTS/XTTS)
    try {
      const xttsResponse = await fetch(`${XTTS_URL}/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice_id,
          language,
        }),
      })

      if (!xttsResponse.ok) {
        const error = await xttsResponse.json().catch(() => ({ detail: 'TTS generation failed' }))
        throw new Error(error.detail || 'Failed to generate TTS')
      }

      const audioBuffer = await xttsResponse.arrayBuffer()
      const latency = Date.now() - startTime

      console.log(`✓ TTS generated: ${text.substring(0, 50)}... (${latency}ms)`)

      const voiceType = voice_id.startsWith('clone_') ? 'cloned' : 'standard'

      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Disposition': `attachment; filename="voiceover-${Date.now()}.wav"`,
          'Content-Length': audioBuffer.byteLength.toString(),
          'X-Generation-Latency': latency.toString(),
          'X-Voice-Type': voiceType,
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': (remaining - 1).toString(),
          'X-RateLimit-Reset': reset.toString(),
        },
      })
    } catch (error) {
      console.error('TTS sidecar error:', error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to generate audio' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('TTS generation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate speech' },
      { status: 500 }
    )
  }
}
