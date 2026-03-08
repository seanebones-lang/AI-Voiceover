import { NextRequest, NextResponse } from 'next/server'
import { synthesizeEdge, isEdgeVoice } from '@/lib/edgeTtsService'
import { synthesizeEdgeTts as synthesizeEdgeFallback } from '@/lib/edgeTtsFallback'
import { config, withRetry } from '@/lib/config'
import { ttsRateLimiter } from '@/lib/rate-limit'
import { extractClientIP } from '@/lib/validation'
import { generateRequestId } from '@/lib/monitoring'
import { buildTtsCacheKey, getCached, setCached } from '@/lib/tts-cache'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const ip = extractClientIP(request)

  const { success } = await ttsRateLimiter.limit(ip)
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.text?.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const {
    text,
    voice_id = 'default_english',
    speed = 1.0,
    pitch = 0,
    // emotion and effect are accepted but not yet applied at the sidecar level
  } = body

  const cacheKey = buildTtsCacheKey({ text: text.trim(), voice_id, language: 'en', speed, pitch, volume: 1, reverb: 0, echo: 0, noise_reduction: false, special_effect: 'none' })
  const cached = getCached(cacheKey)
  if (cached) {
    return new NextResponse(cached.buffer, {
      headers: {
        'Content-Type': cached.contentType,
        'Content-Length': String(cached.buffer.byteLength),
        'X-Cache': 'HIT',
        'X-Request-Id': requestId,
      },
    })
  }

  // Route standard (edge-tts) voices to Edge TTS with fallback
  if (!voice_id || isEdgeVoice(voice_id)) {
    const resolvedVoice = voice_id || 'default_english'
    let mp3: Buffer | null = null
    let edgeMethod = 'websocket'

    try {
      mp3 = await synthesizeEdge({ text: text.trim(), voiceId: resolvedVoice, speed, pitch })
    } catch {
      // WebSocket method failed, try fallback
    }

    if (!mp3) {
      try {
        edgeMethod = 'universal'
        mp3 = await synthesizeEdgeFallback(text.trim(), resolvedVoice, { speed, pitch })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ error: 'Edge TTS failed', details: msg }, { status: 503 })
      }
    }

    const buf = new Uint8Array(mp3).buffer as ArrayBuffer
    setCached(cacheKey, buf, 'audio/mpeg')
    return new NextResponse(new Uint8Array(mp3), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': mp3.byteLength.toString(),
        'X-Voice-Type': `edge-tts-${edgeMethod}`,
        'X-Request-Id': requestId,
      },
    })
  }

  // Cloned voices → XTTS sidecar
  try {
    const xttsService = config.services.xtts
    const xttsResponse = await withRetry(async () => {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), xttsService.timeout)
      try {
        const res = await fetch(`${xttsService.url}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
          body: JSON.stringify({ text: text.trim(), voice_id, language: 'en', speed, pitch }),
          signal: controller.signal,
        })
        clearTimeout(t)
        return res
      } catch (e) {
        clearTimeout(t)
        throw e
      }
    }, xttsService.retries, 1000, 2)

    if (!xttsResponse.ok) {
      const err = await xttsResponse.json().catch(() => ({ detail: 'TTS failed' }))
      throw new Error(err.detail || `XTTS returned ${xttsResponse.status}`)
    }

    const audioBuffer = await xttsResponse.arrayBuffer()
    const contentType = xttsResponse.headers.get('content-type') || 'audio/mpeg'
    setCached(cacheKey, audioBuffer, contentType)

    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': audioBuffer.byteLength.toString(),
        'X-Voice-Type': 'cloned',
        'X-Request-Id': requestId,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'TTS service unavailable', details: msg }, { status: 503 })
  }
}
