/**
 * TTS API v2
 * Supports Edge TTS (Microsoft Neural) and xAI voices.
 * Used by the playground page.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCorsHeaders, handleCorsPreflight } from '@/lib/cors'
import { synthesizeEdge, isEdgeVoice } from '@/lib/edgeTtsService'
import { synthesizeXai, pcmToWav, isValidXaiVoice } from '@/lib/xaiTtsService'

export const dynamic = 'force-dynamic'

interface TTSRequest {
  text: string
  voice_id?: string
  emotion?: string
  language?: string
  speed?: number
  pitch?: number
}

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return handleCorsPreflight(origin)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  try {
    const body: TTSRequest = await request.json()

    if (!body.text || typeof body.text !== 'string' || !body.text.trim()) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400, headers: corsHeaders })
    }

    if (body.text.length > 10000) {
      return NextResponse.json({ error: 'Text must be 10,000 characters or less' }, { status: 400, headers: corsHeaders })
    }

    const voiceId = body.voice_id || 'default_english'
    const speed = body.speed ?? 1.0
    const pitch = body.pitch ?? 0
    const startTime = Date.now()

    // Edge TTS voices (Microsoft Neural)
    if (isEdgeVoice(voiceId)) {
      const mp3 = await synthesizeEdge({ text: body.text.trim(), voiceId, speed, pitch })
      const latency = Date.now() - startTime
      return new NextResponse(new Uint8Array(mp3), {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': String(mp3.length),
          'X-Generation-Latency': latency.toString(),
          'X-TTS-Engine': 'edge-tts',
          ...corsHeaders,
        },
      })
    }

    // xAI voices (Eve, Ara, Rex, Sal, Leo)
    if (isValidXaiVoice(voiceId)) {
      const apiKey = process.env.XAI_API_KEY
      if (!apiKey) {
        return NextResponse.json(
          { error: 'xAI voice selected but XAI_API_KEY is not configured' },
          { status: 503, headers: corsHeaders }
        )
      }
      const pcm = await synthesizeXai({ text: body.text.trim(), voiceId, apiKey })
      const wav = pcmToWav(pcm)
      const latency = Date.now() - startTime
      return new NextResponse(new Uint8Array(wav), {
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': String(wav.length),
          'X-Generation-Latency': latency.toString(),
          'X-TTS-Engine': 'xai',
          ...corsHeaders,
        },
      })
    }

    // Fallback: unknown voice — try Edge TTS default
    const mp3 = await synthesizeEdge({ text: body.text.trim(), voiceId: 'default_english', speed, pitch })
    const latency = Date.now() - startTime
    return new NextResponse(new Uint8Array(mp3), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(mp3.length),
        'X-Generation-Latency': latency.toString(),
        'X-TTS-Engine': 'edge-tts-fallback',
        ...corsHeaders,
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'TTS failed'
    console.error('TTS v2 error:', msg)
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders })
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    engine: 'edge-tts + xai',
    voices: ['edge-tts', 'xai'],
  })
}
