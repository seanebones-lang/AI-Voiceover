import { NextResponse } from 'next/server'
import { getXaiVoices } from '@/lib/xaiTtsService'

export const dynamic = 'force-dynamic'

export async function GET() {
  const voices = getXaiVoices()
  return NextResponse.json({
    voices: voices.map((v) => ({
      voice_id: v.voice_id,
      name: v.name,
      description: v.description,
      language: 'en',
      gender: v.gender,
      source: v.source,
      category: v.category,
    })),
  })
}
