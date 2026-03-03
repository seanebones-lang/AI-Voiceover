import { NextRequest, NextResponse } from 'next/server'
import { synthesizeXai, pcmToWav, isValidXaiVoice } from '@/lib/xaiTtsService'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'XAI_API_KEY is not configured' }, { status: 503 })
  }

  let body: { text?: string; voice_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const voiceId = typeof body.voice_id === 'string' ? body.voice_id : 'Eve'

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }
  if (!isValidXaiVoice(voiceId)) {
    return NextResponse.json(
      { error: 'Invalid voice_id. Use one of: Eve, Ara, Rex, Sal, Leo' },
      { status: 400 }
    )
  }

  try {
    const pcm = await synthesizeXai({ text, voiceId, apiKey })
    const wav = pcmToWav(pcm)
    return new NextResponse(new Uint8Array(wav), {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(wav.length),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'xAI TTS failed', details: message }, { status: 502 })
  }
}
