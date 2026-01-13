import { NextRequest, NextResponse } from 'next/server'
import { ttsRateLimiter } from '@/lib/rate-limit'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Force port 8081 - the Python sidecar port
const XTTS_URL = 'http://localhost:8081'

interface TTSRequest {
  text: string
  voice_id: string
  speed?: number
  pitch?: number
  volume?: number
  language?: string
}

// Generate a simple test tone WAV file (for fallback/testing)
function generateTestTone(durationMs: number = 500, frequency: number = 440): Buffer {
  const sampleRate = 22050
  const numSamples = Math.floor(sampleRate * durationMs / 1000)
  const buffer = Buffer.alloc(44 + numSamples * 2) // WAV header + 16-bit samples
  
  // WAV header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + numSamples * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16) // Subchunk1Size
  buffer.writeUInt16LE(1, 20)  // AudioFormat (PCM)
  buffer.writeUInt16LE(1, 22)  // NumChannels
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28) // ByteRate
  buffer.writeUInt16LE(2, 32)  // BlockAlign
  buffer.writeUInt16LE(16, 34) // BitsPerSample
  buffer.write('data', 36)
  buffer.writeUInt32LE(numSamples * 2, 40)
  
  // Generate sine wave
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    const sample = Math.sin(2 * Math.PI * frequency * t) * 0.3 * 32767
    buffer.writeInt16LE(Math.round(sample), 44 + i * 2)
  }
  
  return buffer
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

    console.log(`🎤 TTS Request: voice=${voice_id}, text="${text.substring(0, 50)}..."`)
    
    // Try Python sidecar first
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000) // 30s timeout
      
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
        signal: controller.signal,
      })
      
      clearTimeout(timeout)

      if (!xttsResponse.ok) {
        const error = await xttsResponse.json().catch(() => ({ detail: 'TTS generation failed' }))
        throw new Error(error.detail || `TTS sidecar returned ${xttsResponse.status}`)
      }

      const audioBuffer = await xttsResponse.arrayBuffer()
      const latency = Date.now() - startTime

      console.log(`✓ TTS generated via sidecar: ${text.substring(0, 30)}... (${latency}ms)`)

      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename="voiceover-${Date.now()}.mp3"`,
          'Content-Length': audioBuffer.byteLength.toString(),
          'X-Generation-Latency': latency.toString(),
          'X-Voice-Type': voice_id.startsWith('clone_') ? 'cloned' : 'standard',
          'X-TTS-Engine': 'edge-tts',
        },
      })
    } catch (sidecarError) {
      const errorMessage = sidecarError instanceof Error ? sidecarError.message : 'Unknown error'
      console.error(`⚠️ TTS sidecar error: ${errorMessage}`)
      
      // Return detailed error for debugging
      return NextResponse.json(
        { 
          error: 'TTS service temporarily unavailable',
          details: {
            message: errorMessage,
            sidecar_url: XTTS_URL,
            suggestion: 'The TTS backend service may be starting up or experiencing issues. Please try again in a moment.',
          }
        },
        { status: 503 }
      )
    }
  } catch (error) {
    console.error('TTS API error:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process TTS request',
        details: { type: 'request_error' }
      },
      { status: 500 }
    )
  }
}
