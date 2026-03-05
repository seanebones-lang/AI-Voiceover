/**
 * Batch TTS API Route
 * Process multiple texts in one request using Edge TTS or xAI voices.
 */

import { NextRequest, NextResponse } from 'next/server'
import { synthesizeEdge, isEdgeVoice } from '@/lib/edgeTtsService'
import { synthesizeXai, pcmToWav, isValidXaiVoice } from '@/lib/xaiTtsService'

export const dynamic = 'force-dynamic'

interface BatchItem {
  text: string
  voice_id?: string
  emotion?: string
  language?: string
  speed?: number
  pitch?: number
}

interface BatchRequest {
  texts: BatchItem[]
  output_format?: 'separate' | 'combined'
}

interface BatchResult {
  index: number
  text: string
  voice_id: string
  audio_base64?: string
  content_type?: string
  error?: string
  latency_ms: number
}

async function synthesizeOne(item: BatchItem, index: number): Promise<BatchResult> {
  const start = Date.now()
  const voiceId = item.voice_id || 'default_english'
  const speed = item.speed ?? 1.0
  const pitch = item.pitch ?? 0

  try {
    if (isEdgeVoice(voiceId)) {
      const mp3 = await synthesizeEdge({ text: item.text.trim(), voiceId, speed, pitch })
      return {
        index,
        text: item.text,
        voice_id: voiceId,
        audio_base64: mp3.toString('base64'),
        content_type: 'audio/mpeg',
        latency_ms: Date.now() - start,
      }
    }

    if (isValidXaiVoice(voiceId)) {
      const apiKey = process.env.XAI_API_KEY
      if (!apiKey) {
        return { index, text: item.text, voice_id: voiceId, error: 'XAI_API_KEY not configured', latency_ms: Date.now() - start }
      }
      const pcm = await synthesizeXai({ text: item.text.trim(), voiceId, apiKey })
      const wav = pcmToWav(pcm)
      return {
        index,
        text: item.text,
        voice_id: voiceId,
        audio_base64: wav.toString('base64'),
        content_type: 'audio/wav',
        latency_ms: Date.now() - start,
      }
    }

    // Unknown voice → fallback to Edge TTS default
    const mp3 = await synthesizeEdge({ text: item.text.trim(), voiceId: 'default_english', speed, pitch })
    return {
      index,
      text: item.text,
      voice_id: 'default_english',
      audio_base64: mp3.toString('base64'),
      content_type: 'audio/mpeg',
      latency_ms: Date.now() - start,
    }
  } catch (err) {
    return {
      index,
      text: item.text,
      voice_id: voiceId,
      error: err instanceof Error ? err.message : 'Synthesis failed',
      latency_ms: Date.now() - start,
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: BatchRequest = await request.json()

    if (!body.texts || !Array.isArray(body.texts) || body.texts.length === 0) {
      return NextResponse.json({ error: 'texts array is required' }, { status: 400 })
    }

    if (body.texts.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 texts per batch' }, { status: 400 })
    }

    // Validate each item
    for (const item of body.texts) {
      if (!item.text || typeof item.text !== 'string') {
        return NextResponse.json({ error: 'Each item must have a text field' }, { status: 400 })
      }
      if (item.text.length > 5000) {
        return NextResponse.json({ error: 'Each text must be 5,000 characters or less' }, { status: 400 })
      }
    }

    console.log(`Batch TTS: ${body.texts.length} items`)

    // Process in parallel (with concurrency limit to avoid overload)
    const CONCURRENCY = 5
    const results: BatchResult[] = []
    for (let i = 0; i < body.texts.length; i += CONCURRENCY) {
      const slice = body.texts.slice(i, i + CONCURRENCY)
      const sliceResults = await Promise.all(slice.map((item, j) => synthesizeOne(item, i + j)))
      results.push(...sliceResults)
    }

    const succeeded = results.filter((r) => !r.error).length
    const failed = results.filter((r) => r.error).length

    return NextResponse.json({
      batch_id: `batch_${Date.now()}`,
      total: results.length,
      succeeded,
      failed,
      results,
    })
  } catch (error) {
    console.error('Batch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Batch failed' },
      { status: 500 }
    )
  }
}

// Batch status (for compatibility — returns a simple completed status since we process synchronously)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const batchId = searchParams.get('id')

  if (!batchId) {
    return NextResponse.json({ error: 'Batch ID required' }, { status: 400 })
  }

  return NextResponse.json({ batch_id: batchId, status: 'completed', message: 'Batch results are returned synchronously in the POST response' })
}
