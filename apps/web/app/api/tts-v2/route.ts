import { NextRequest, NextResponse } from 'next/server'
import { denyUnlessMutableApiAuthorized } from '@/lib/api-access'
import { jsonApiError } from '@/lib/api-response'
import { synthesizeEdge, isEdgeVoice } from '@/lib/edgeTtsService'
import { synthesizeEdgeTts as synthesizeEdgeFallback } from '@/lib/edgeTtsFallback'
import { config, withRetry } from '@/lib/config'
import { ttsRateLimiter } from '@/lib/rate-limit'
import { extractClientIP, validateTTSRequest } from '@/lib/validation'
import { generateRequestId } from '@/lib/monitoring'
import { buildTtsCacheKey, getCached, setCached } from '@/lib/tts-cache'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const denied = denyUnlessMutableApiAuthorized(request)
  if (denied) return denied

  const requestId = generateRequestId()
  const ip = extractClientIP(request)

  const { success } = await ttsRateLimiter.limit(ip)
  if (!success) {
    return jsonApiError(429, 'Rate limit exceeded', {
      code: 'RATE_LIMITED',
      requestId,
    })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return jsonApiError(400, 'Invalid JSON in request body', {
      code: 'INVALID_JSON',
      requestId,
    })
  }

  const validation = validateTTSRequest(body)
  if (!validation.success || !validation.data) {
    return jsonApiError(400, validation.error || 'Validation failed', {
      code: 'VALIDATION_ERROR',
      requestId,
    })
  }

  const {
    text,
    voice_id,
    language = 'en',
    speed = 1.0,
    pitch = 0,
    volume = 1.0,
    reverb = 0,
    echo = 0,
    noise_reduction = false,
    special_effect = 'none',
    // emotion and effect are accepted but not yet applied at the sidecar level
  } = validation.data

  const cacheKey = buildTtsCacheKey({
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
  })
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
        return jsonApiError(503, 'Edge TTS failed', {
          code: 'EDGE_TTS_FAILED',
          details: msg,
          requestId,
        })
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
          body: JSON.stringify({ text: text.trim(), voice_id, language, speed, pitch, volume, reverb, echo, noise_reduction, special_effect }),
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
    return jsonApiError(503, 'TTS service unavailable', {
      code: 'XTTS_UNAVAILABLE',
      details: msg,
      requestId,
    })
  }
}
