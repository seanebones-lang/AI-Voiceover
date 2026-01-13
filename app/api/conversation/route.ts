/**
 * Conversation TTS API Route
 * Multi-speaker dialogue synthesis
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || 'http://localhost:8082'

interface DialogueTurn {
  speaker_id: string
  speaker_name: string
  text: string
  emotion?: string
}

interface ConversationRequest {
  turns: DialogueTurn[]
  turn_gap_ms?: number
  output_format?: 'audio' | 'timeline' | 'subtitles'
  subtitle_format?: 'srt' | 'vtt'
}

export async function POST(request: NextRequest) {
  try {
    const body: ConversationRequest = await request.json()

    if (!body.turns || !Array.isArray(body.turns) || body.turns.length === 0) {
      return NextResponse.json(
        { error: 'turns array is required' },
        { status: 400 }
      )
    }

    // Validate turns
    for (const turn of body.turns) {
      if (!turn.speaker_id || !turn.text) {
        return NextResponse.json(
          { error: 'Each turn requires speaker_id and text' },
          { status: 400 }
        )
      }
    }

    console.log(`🎭 Conversation request: ${body.turns.length} turns`)

    // Request based on output format
    const outputFormat = body.output_format || 'audio'

    const response = await fetch(`${TTS_SERVICE_URL}/conversation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turns: body.turns,
        turn_gap_ms: body.turn_gap_ms || 500,
        output_format: outputFormat,
        subtitle_format: body.subtitle_format || 'srt',
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: error.detail || 'Conversation synthesis failed' },
        { status: response.status }
      )
    }

    // Return based on format
    if (outputFormat === 'audio') {
      const audioBuffer = await response.arrayBuffer()
      
      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Disposition': `attachment; filename="conversation-${Date.now()}.wav"`,
        },
      })
    }

    return NextResponse.json(await response.json())

  } catch (error) {
    console.error('Conversation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Conversation failed' },
      { status: 500 }
    )
  }
}
