import { NextRequest, NextResponse } from 'next/server'
import { ttsRateLimiter } from '@/lib/rate-limit'

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
  // Audio effects
  reverb?: number
  echo?: number
  noise_reduction?: boolean
  // Special effects
  special_effect?: string // 'none' | 'robot' | 'radio' | 'whisper' | 'deep' | 'chipmunk' | 'cave' | 'telephone'
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
               request.headers.get('x-real-ip') || '127.0.0.1'
    const { success, limit, remaining, reset } = await ttsRateLimiter.limit(ip)
    
    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', limit, remaining, reset: new Date(reset).toISOString() },
        { status: 429 }
      )
    }

    const body: TTSRequest = await request.json()
    const { 
      text, voice_id, language = 'en', 
      speed = 1.0, pitch = 0, volume = 1.0,
      reverb = 0, echo = 0, noise_reduction = false,
      special_effect = 'none'
    } = body

    // Validation
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Valid text is required' }, { status: 400 })
    }

    if (text.length > 5000) {
      return NextResponse.json({ error: 'Text must be 5,000 characters or less' }, { status: 400 })
    }

    if (!voice_id) {
      return NextResponse.json({ error: 'voice_id is required' }, { status: 400 })
    }

    const startTime = Date.now()
    console.log(`🎤 TTS: voice=${voice_id}, speed=${speed}, pitch=${pitch}, volume=${volume}`)
    
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60000) // 60s for voice cloning
      
      const xttsResponse = await fetch(`${XTTS_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          voice_id,
          language,
          speed,
          pitch,
          volume,
          reverb,
          echo,
          noise_reduction,
          special_effect,
        }),
        signal: controller.signal,
      })
      
      clearTimeout(timeout)

      if (!xttsResponse.ok) {
        const error = await xttsResponse.json().catch(() => ({ detail: 'TTS failed' }))
        throw new Error(error.detail || `TTS sidecar returned ${xttsResponse.status}`)
      }

      const audioBuffer = await xttsResponse.arrayBuffer()
      const latency = Date.now() - startTime
      const contentType = xttsResponse.headers.get('content-type') || 'audio/mpeg'

      console.log(`✅ TTS generated: ${audioBuffer.byteLength} bytes in ${latency}ms`)

      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': audioBuffer.byteLength.toString(),
          'X-Generation-Latency': latency.toString(),
          'X-Voice-Type': voice_id.startsWith('clone_') ? 'cloned' : 'standard',
        },
      })
    } catch (sidecarError) {
      console.error(`⚠️ TTS error: ${sidecarError}`)
      return NextResponse.json(
        { error: 'TTS service error', details: String(sidecarError) },
        { status: 503 }
      )
    }
  } catch (error) {
    console.error('TTS API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: 500 }
    )
  }
}
