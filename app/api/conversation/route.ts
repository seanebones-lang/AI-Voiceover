/**
 * Conversation TTS API Route
 * Multi-speaker dialogue synthesis using Edge TTS or xAI voices.
 * Returns per-turn audio segments as JSON with base64-encoded audio.
 */

import { NextRequest, NextResponse } from 'next/server'
import { synthesizeEdge, isEdgeVoice } from '@/lib/edgeTtsService'
import { synthesizeXai, pcmToWav, isValidXaiVoice } from '@/lib/xaiTtsService'

export const dynamic = 'force-dynamic'

interface DialogueTurn {
  speaker_id: string
  speaker_name: string
  text: string
  voice_id?: string
  emotion?: string
  speed?: number
  pitch?: number
}

interface ConversationRequest {
  turns: DialogueTurn[]
  turn_gap_ms?: number
  output_format?: 'segments' | 'timeline' | 'subtitles'
  subtitle_format?: 'srt' | 'vtt'
}

// Default speaker → voice mapping
const SPEAKER_VOICE_MAP: Record<string, string> = {
  speaker_1: 'default_english',
  speaker_2: 'female_english',
  host: 'default_english',
  guest: 'female_british',
}

function formatSrt(turns: Array<{ text: string; start_ms: number; end_ms: number; speaker_name: string }>): string {
  return turns.map((t, i) => {
    const fmt = (ms: number) => {
      const h = Math.floor(ms / 3600000).toString().padStart(2, '0')
      const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0')
      const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0')
      const ms2 = (ms % 1000).toString().padStart(3, '0')
      return `${h}:${m}:${s},${ms2}`
    }
    return `${i + 1}\n${fmt(t.start_ms)} --> ${fmt(t.end_ms)}\n[${t.speaker_name}] ${t.text}\n`
  }).join('\n')
}

function formatVtt(turns: Array<{ text: string; start_ms: number; end_ms: number; speaker_name: string }>): string {
  const lines = ['WEBVTT', '']
  turns.forEach((t) => {
    const fmt = (ms: number) => {
      const h = Math.floor(ms / 3600000).toString().padStart(2, '0')
      const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0')
      const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0')
      const ms2 = (ms % 1000).toString().padStart(3, '0')
      return `${h}:${m}:${s}.${ms2}`
    }
    lines.push(`${fmt(t.start_ms)} --> ${fmt(t.end_ms)}`, `<v ${t.speaker_name}>${t.text}`, '')
  })
  return lines.join('\n')
}

export async function POST(request: NextRequest) {
  try {
    const body: ConversationRequest = await request.json()

    if (!body.turns || !Array.isArray(body.turns) || body.turns.length === 0) {
      return NextResponse.json({ error: 'turns array is required' }, { status: 400 })
    }

    if (body.turns.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 turns per conversation' }, { status: 400 })
    }

    for (const turn of body.turns) {
      if (!turn.speaker_id || !turn.text) {
        return NextResponse.json({ error: 'Each turn requires speaker_id and text' }, { status: 400 })
      }
    }

    const outputFormat = body.output_format || 'segments'
    const turnGapMs = body.turn_gap_ms ?? 500

    console.log(`Conversation TTS: ${body.turns.length} turns, format=${outputFormat}`)

    // Synthesize each turn sequentially to maintain order
    const segments: Array<{
      index: number
      speaker_id: string
      speaker_name: string
      text: string
      voice_id: string
      audio_base64?: string
      content_type?: string
      duration_ms: number
      start_ms: number
      error?: string
    }> = []

    let currentMs = 0

    for (let i = 0; i < body.turns.length; i++) {
      const turn = body.turns[i]
      const voiceId = turn.voice_id || SPEAKER_VOICE_MAP[turn.speaker_id] || 'default_english'
      const speed = turn.speed ?? 1.0
      const pitch = turn.pitch ?? 0
      const startMs = currentMs
      const start = Date.now()

      try {
        let audioBuffer: Buffer
        let contentType: string

        if (isEdgeVoice(voiceId)) {
          audioBuffer = await synthesizeEdge({ text: turn.text.trim(), voiceId, speed, pitch })
          contentType = 'audio/mpeg'
        } else if (isValidXaiVoice(voiceId)) {
          const apiKey = process.env.XAI_API_KEY
          if (!apiKey) throw new Error('XAI_API_KEY not configured')
          const pcm = await synthesizeXai({ text: turn.text.trim(), voiceId, apiKey })
          audioBuffer = pcmToWav(pcm)
          contentType = 'audio/wav'
        } else {
          audioBuffer = await synthesizeEdge({ text: turn.text.trim(), voiceId: 'default_english', speed, pitch })
          contentType = 'audio/mpeg'
        }

        const durationMs = Date.now() - start
        currentMs += durationMs + turnGapMs

        segments.push({
          index: i,
          speaker_id: turn.speaker_id,
          speaker_name: turn.speaker_name,
          text: turn.text,
          voice_id: voiceId,
          audio_base64: audioBuffer.toString('base64'),
          content_type: contentType,
          duration_ms: durationMs,
          start_ms: startMs,
        })
      } catch (err) {
        segments.push({
          index: i,
          speaker_id: turn.speaker_id,
          speaker_name: turn.speaker_name,
          text: turn.text,
          voice_id: voiceId,
          duration_ms: 0,
          start_ms: startMs,
          error: err instanceof Error ? err.message : 'Synthesis failed',
        })
        currentMs += turnGapMs
      }
    }

    if (outputFormat === 'subtitles') {
      const subtitleFormat = body.subtitle_format || 'srt'
      const turnData = segments.map((s) => ({
        text: s.text,
        start_ms: s.start_ms,
        end_ms: s.start_ms + s.duration_ms,
        speaker_name: s.speaker_name,
      }))
      const content = subtitleFormat === 'vtt' ? formatVtt(turnData) : formatSrt(turnData)
      return new NextResponse(content, {
        headers: {
          'Content-Type': subtitleFormat === 'vtt' ? 'text/vtt' : 'text/plain',
          'Content-Disposition': `attachment; filename="conversation.${subtitleFormat}"`,
        },
      })
    }

    return NextResponse.json({
      turns: segments.length,
      total_duration_ms: currentMs,
      segments,
    })
  } catch (error) {
    console.error('Conversation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Conversation failed' },
      { status: 500 }
    )
  }
}
