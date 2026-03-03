// Updated existing TTS route

import { NextRequest, NextResponse } from 'next/server'
import { synthesizeTTS } from '@/lib/tts_v2/xtts'

/** Build voice buffer from request body (base64-encoded voice sample or empty for default). */
function getVoiceBuffer(voice: unknown): Buffer {
  if (typeof voice === 'string' && voice.length > 0) {
    try {
      return Buffer.from(voice, 'base64')
    } catch {
      return Buffer.alloc(0)
    }
  }
  return Buffer.alloc(0)
}

/** Return audio buffer as-is; format conversion could be added via ffmpeg. */
async function convertToFormat(audio: Buffer, format: string): Promise<Buffer> {
  return audio
}

export async function POST(req: NextRequest) {
  const { text, voice, emotion, speed, pitch, temperature, format = 'mp3' } = await req.json()
  const userId = req.headers.get('x-api-user-id')

  const creditsCost = Math.ceil((text?.length ?? 0) / 10)
  // deduct...

  const voiceBuffer = getVoiceBuffer(voice)
  const audio = await synthesizeTTS(text, voiceBuffer, {
    emotion: emotion as 'happy' | 'sad' | 'angry' | 'excited' | 'neutral',
    speed: Number(speed),
    pitch: Number(pitch),
    temperature: Number(temperature),
  })

  return new NextResponse(new Uint8Array(await convertToFormat(audio, format)), {
    headers: { 'Content-Type': format === 'mp3' ? 'audio/mpeg' : `audio/${format}` },
  })
}