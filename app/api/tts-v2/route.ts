/**
 * HumanMirage TTS API Route
 * Proxies to the new Python TTS service
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCorsHeaders, handleCorsPreflight } from '@/lib/cors'

export const dynamic = 'force-dynamic'

const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || 'http://localhost:8082'

interface TTSRequest {
  text: string
  voice_id?: string
  emotion?: string
  language?: string
  speed?: number
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

    // Validation
    if (!body.text || typeof body.text !== 'string' || !body.text.trim()) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400, headers: corsHeaders }
      )
    }

    if (body.text.length > 10000) {
      return NextResponse.json(
        { error: 'Text must be 10,000 characters or less' },
        { status: 400, headers: corsHeaders }
      )
    }

    console.log(`🎤 TTS request: emotion=${body.emotion || 'neutral'}, text="${body.text.substring(0, 50)}..."`)

    const startTime = Date.now()

    // Forward to TTS service
    const response = await fetch(`${TTS_SERVICE_URL}/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: body.text.trim(),
        voice_id: body.voice_id,
        emotion: body.emotion || 'neutral',
        language: body.language || 'en',
        speed: body.speed || 1.0,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'TTS service error' }))
      console.error('TTS service error:', error)
      return NextResponse.json(
        { error: error.detail || 'TTS generation failed' },
        { status: response.status, headers: corsHeaders }
      )
    }

    const audioBuffer = await response.arrayBuffer()
    const latency = Date.now() - startTime

    console.log(`✅ TTS generated in ${latency}ms`)

    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Disposition': `attachment; filename="tts-${Date.now()}.wav"`,
        'Content-Length': audioBuffer.byteLength.toString(),
        'X-Generation-Latency': latency.toString(),
        'X-TTS-Engine': 'humanmirage-v3',
        ...corsHeaders,
      },
    })
  } catch (error) {
    console.error('TTS route error:', error)
    
    // Check if it's a connection error
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return NextResponse.json(
        { error: 'TTS service unavailable. Is the service running?' },
        { status: 503, headers: corsHeaders }
      )
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'TTS failed' },
      { status: 500, headers: corsHeaders }
    )
  }
}

// Health check
export async function GET() {
  try {
    const response = await fetch(`${TTS_SERVICE_URL}/health`)
    const data = await response.json()
    
    return NextResponse.json({
      status: 'ok',
      engine: 'humanmirage-v3',
      service: data,
    })
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'TTS service not responding' },
      { status: 503 }
    )
  }
}
