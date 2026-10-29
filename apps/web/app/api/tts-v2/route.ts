import { NextRequest, NextResponse } from 'next/server'
import { denyUnlessMutableApiAuthorized } from '@/lib/api-access'
import { jsonApiError } from '@/lib/api-response'
import { isXttsVoice } from '@/lib/tts/stock-voices'
import { synthesizeWithVoiceService, voiceServiceTimeoutMs } from '@/lib/tts/voice-service-client'
import { ttsRateLimiter } from '@/lib/rate-limit'
import { extractClientIP, validateTTSRequest, CLONED_TTS_MAX_CHARS } from '@/lib/validation'
import { generateRequestId } from '@/lib/monitoring'
import { buildTtsCacheKey, getCached, setCached } from '@/lib/tts-cache'
import { applyEmotionProsody } from '@/lib/tts/emotion-prosody'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

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
    emotion = 'neutral',
    clone_preset,
    output_format = 'wav',
    temperature: ttsTemperature,
    repetition_penalty: ttsRepetitionPenalty,
    top_k: ttsTopK,
    top_p: ttsTopP,
  } = validation.data

  const {
    speed: ttsSpeed,
    pitch: ttsPitch,
    volume: ttsVolume,
    reverb: ttsReverb,
    echo: ttsEcho,
    noise_reduction: ttsNoiseReduction,
    special_effect: ttsSpecialEffect,
  } = applyEmotionProsody(
    { speed, pitch, volume, reverb, echo, noise_reduction, special_effect },
    emotion
  )

  const isClonedVoice = voice_id.startsWith('clone_')
  const usesXtts = isXttsVoice(voice_id)
  const cloneTuneKey = usesXtts
    ? [
        clone_preset ?? 'natural',
        ttsTemperature !== undefined ? String(ttsTemperature) : '_',
        ttsRepetitionPenalty !== undefined ? String(ttsRepetitionPenalty) : '_',
        ttsTopK !== undefined ? String(ttsTopK) : '_',
        ttsTopP !== undefined ? String(ttsTopP) : '_',
      ].join(':')
    : ''

  const cacheKey = buildTtsCacheKey({
    text: text.trim(),
    voice_id,
    language,
    speed: ttsSpeed,
    pitch: ttsPitch,
    volume: ttsVolume,
    reverb: ttsReverb,
    echo: ttsEcho,
    noise_reduction: ttsNoiseReduction,
    special_effect: ttsSpecialEffect,
    clone_tune: cloneTuneKey,
    emotion: `${emotion}:${output_format}`,
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

  const textLen = text.trim().length
  if (usesXtts && textLen > CLONED_TTS_MAX_CHARS) {
    return NextResponse.json(
      {
        error: 'Cloned/studio voice text too long for synchronous generation',
        code: 'CLONE_TEXT_TOO_LONG',
        maxChars: CLONED_TTS_MAX_CHARS,
        receivedChars: textLen,
        requestId,
      },
      { status: 413, headers: { 'X-Request-Id': requestId } }
    )
  }

  const hasEffects =
    ttsReverb > 0 || ttsEcho > 0 || ttsNoiseReduction || ttsSpecialEffect !== 'none'

  try {
    const result = await synthesizeWithVoiceService(
      {
        text: text.trim(),
        voice_id,
        language,
        speed: ttsSpeed,
        pitch: ttsPitch,
        volume: ttsVolume,
        reverb: ttsReverb,
        echo: ttsEcho,
        noise_reduction: ttsNoiseReduction,
        special_effect: ttsSpecialEffect,
        output_format,
        ...(usesXtts
          ? {
              ...(clone_preset && clone_preset !== 'auto' ? { clone_preset } : {}),
              ...(ttsTemperature !== undefined ? { temperature: ttsTemperature } : {}),
              ...(ttsRepetitionPenalty !== undefined ? { repetition_penalty: ttsRepetitionPenalty } : {}),
              ...(ttsTopK !== undefined ? { top_k: ttsTopK } : {}),
              ...(ttsTopP !== undefined ? { top_p: ttsTopP } : {}),
            }
          : {}),
      },
      requestId,
      { timeoutMs: voiceServiceTimeoutMs(voice_id, textLen, hasEffects) }
    )

    if (!result.ok) {
      return jsonApiError(result.status === 503 ? 503 : result.status >= 500 ? 502 : result.status, 'TTS failed', {
        code: result.status === 503 ? 'VOICE_ENGINE_LOADING' : 'TTS_FAILED',
        details: result.detail,
        requestId,
      })
    }

    setCached(cacheKey, result.buffer, result.contentType)
    return new NextResponse(result.buffer, {
      headers: {
        'Content-Type': result.contentType,
        'Content-Length': result.buffer.byteLength.toString(),
        'X-Voice-Type': isClonedVoice ? 'cloned' : 'standard',
        ...(result.engine ? { 'X-Voice-Engine': result.engine } : {}),
        'X-Request-Id': requestId,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return jsonApiError(503, 'TTS service unavailable', {
      code: 'VOICE_SERVICE_UNAVAILABLE',
      details: msg,
      requestId,
    })
  }
}
