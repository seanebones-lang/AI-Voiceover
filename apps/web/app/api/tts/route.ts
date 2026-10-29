import { NextRequest, NextResponse } from 'next/server'
import { denyUnlessMutableApiAuthorized } from '@/lib/api-access'
import { ttsRateLimiter } from '@/lib/rate-limit'
import { config } from '@/lib/config'
import { validateTTSRequest, extractClientIP, CLONED_TTS_MAX_CHARS } from '@/lib/validation'
import { logger, generateRequestId, recordMetric, recordCloneMetric } from '@/lib/monitoring'
import { buildTtsCacheKey, getCached, setCached } from '@/lib/tts-cache'
import { applyEmotionProsody, applyExpressiveCopyProsody } from '@/lib/tts/emotion-prosody'
import { parseProsodyTags } from '@/lib/tts/prosody-tags'
import { applyPronunciationOverrides } from '@/lib/tts/pronunciation'
import { isXttsVoice } from '@/lib/tts/stock-voices'
import {
  isAbortError,
  isUnreachableError,
  synthesizeWithVoiceService,
  voiceServiceTimeoutMs,
} from '@/lib/tts/voice-service-client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Allow long-running XTTS (cloned / studio voice) synthesis on Vercel.
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const denied = denyUnlessMutableApiAuthorized(request)
  if (denied) return denied

  const startTime = Date.now()
  const requestId = request.headers.get('x-request-id') || generateRequestId()
  const ip = extractClientIP(request)
  const userAgent = request.headers.get('user-agent') || 'unknown'

  try {
    logger.info('TTS request received', {
      requestId,
      ip,
      userAgent: userAgent.substring(0, 100), // Truncate long user agents
    })

    // Rate limiting
    const { success, limit, remaining, reset } = await ttsRateLimiter.limit(ip)
    
    if (!success) {
      const latency = Date.now() - startTime
      recordMetric({
        endpoint: '/api/tts',
        method: 'POST',
        statusCode: 429,
        latency,
        timestamp: new Date().toISOString(),
        error: 'Rate limit exceeded',
      })
      
      logger.warn('Rate limit exceeded', { requestId, ip, limit, remaining })
      
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded', 
          limit, 
          remaining, 
          reset: new Date(reset).toISOString(),
          retryAfter: Math.ceil((reset - Date.now()) / 1000)
        },
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': new Date(reset).toISOString(),
            'X-Request-Id': requestId,
          }
        }
      )
    }

    // Parse and validate request body
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }

    const validation = validateTTSRequest(body)
    if (!validation.success || !validation.data) {
      const requestedVoiceId =
        body && typeof body === 'object' && 'voice_id' in body && typeof (body as Record<string, unknown>).voice_id === 'string'
          ? String((body as Record<string, unknown>).voice_id)
          : undefined
      const rawValidationError = validation.error || 'Validation failed'
      const clonedTextLimitExceeded =
        !!requestedVoiceId &&
        isXttsVoice(requestedVoiceId) &&
        (rawValidationError.includes('Cloned voice text must') ||
          rawValidationError.includes(String(CLONED_TTS_MAX_CHARS)))
      return NextResponse.json(
        {
          error: clonedTextLimitExceeded
            ? 'Cloned/studio voice input is too long for one request'
            : rawValidationError,
          ...(clonedTextLimitExceeded
            ? {
                hint: `Keep each cloned or studio voice request under ${CLONED_TTS_MAX_CHARS} characters for reliable synthesis (one XTTS job). Use batch mode or split the script.`,
                maxCharsPerRequest: CLONED_TTS_MAX_CHARS,
              }
            : {}),
        },
        { status: 400 }
      )
    }

    const {
      text, voice_id, language = 'en',
      speed = 1.0, pitch = 0, volume = 1.0,
      reverb = 0, echo = 0, noise_reduction = false,
      special_effect = 'none',
      emotion = 'neutral',
      clone_preset,
      auto_expressive = false,
      expressive_intensity = 'subtle',
      mastering_enabled = false,
      mastering_profile = 'none',
      pronunciation_overrides,
      output_format = 'wav',
      temperature: ttsTemperature,
      repetition_penalty: ttsRepetitionPenalty,
      top_k: ttsTopK,
      top_p: ttsTopP,
    } = validation.data
    const normalizedWithLexicon = applyPronunciationOverrides(text, pronunciation_overrides)
    const tagged = parseProsodyTags(normalizedWithLexicon)
    const normalizedInputText = tagged.cleanText

    const prosody = applyEmotionProsody(
      {
        speed: speed + tagged.adjustments.speedDelta,
        pitch: pitch + tagged.adjustments.pitchDelta,
        volume,
        reverb: reverb + tagged.adjustments.reverbDelta,
        echo,
        noise_reduction,
        special_effect,
      },
      emotion
    )
    const expressiveProsody = applyExpressiveCopyProsody(prosody, normalizedInputText, {
      enabled: auto_expressive,
      intensity: expressive_intensity,
      isClonedVoice: voice_id.startsWith('clone_'),
    })

    const isClonedVoice = voice_id.startsWith('clone_')
    const usesXtts = isXttsVoice(voice_id)
    const cloneTuneKey = usesXtts
      ? [
          clone_preset && clone_preset !== 'auto' ? clone_preset : 'auto',
          ttsTemperature !== undefined ? String(ttsTemperature) : '_',
          ttsRepetitionPenalty !== undefined ? String(ttsRepetitionPenalty) : '_',
          ttsTopK !== undefined ? String(ttsTopK) : '_',
          ttsTopP !== undefined ? String(ttsTopP) : '_',
        ].join(':')
      : ''

    let finalSpeed = expressiveProsody.speed
    let finalPitch = expressiveProsody.pitch
    const finalVolume = expressiveProsody.volume
    let finalReverb = expressiveProsody.reverb
    const finalEcho = expressiveProsody.echo
    const finalNoiseReduction = expressiveProsody.noise_reduction
    const finalSpecialEffect = expressiveProsody.special_effect
    // Long-form anti-drift: progressively damp expressive variance for cloned voices.
    if (isClonedVoice && normalizedInputText.length > 600) {
      const driftScale = Math.min(0.45, (normalizedInputText.length - 600) / 4000)
      finalSpeed = finalSpeed + (1.0 - finalSpeed) * driftScale
      finalPitch = finalPitch * (1.0 - driftScale)
      finalReverb = finalReverb * (1.0 - driftScale * 0.6)
    }

    const cacheKey = buildTtsCacheKey({
      text: normalizedInputText.trim(),
      voice_id,
      language,
      speed: finalSpeed,
      pitch: finalPitch,
      volume: finalVolume,
      reverb: finalReverb,
      echo: finalEcho,
      noise_reduction: finalNoiseReduction,
      special_effect: finalSpecialEffect,
      clone_tune: cloneTuneKey,
      emotion: `${emotion}:${auto_expressive ? expressive_intensity : 'off'}:${mastering_enabled ? mastering_profile : 'dry'}:${output_format}`,
    })
    const voiceType = isClonedVoice ? 'cloned' : 'standard'
    const cached = getCached(cacheKey)
    if (cached) {
      const latency = Date.now() - startTime
      recordMetric({
        endpoint: '/api/tts',
        method: 'POST',
        statusCode: 200,
        latency,
        timestamp: new Date().toISOString(),
        requestId,
        voiceType,
      })
      return new NextResponse(cached.buffer, {
        headers: {
          'Content-Type': cached.contentType,
          'Content-Length': String(cached.buffer.byteLength),
          'X-Generation-Latency': latency.toString(),
          'X-Voice-Type': 'cached',
          'X-Request-Id': requestId,
        },
      })
    }

    const normalizedText = normalizedInputText.trim()
    const textLen = normalizedText.length
    if (usesXtts && textLen > CLONED_TTS_MAX_CHARS) {
      return NextResponse.json(
        {
          error: 'Cloned/studio voice text too long for synchronous generation',
          requestId,
          maxChars: CLONED_TTS_MAX_CHARS,
          receivedChars: textLen,
          hint: 'Split into shorter sections (or use batch mode). For very long content, use a GPU voice service or multiple requests.',
        },
        { status: 413, headers: { 'X-Request-Id': requestId } }
      )
    }

    const hasEffects =
      finalReverb > 0 ||
      finalEcho > 0 ||
      finalNoiseReduction ||
      finalSpecialEffect !== 'none' ||
      (mastering_enabled && mastering_profile !== 'none')

    if (isClonedVoice) recordCloneMetric('clone_tts_requested')

    try {
      const result = await synthesizeWithVoiceService(
        {
          text: normalizedText,
          voice_id,
          language,
          speed: finalSpeed,
          pitch: finalPitch,
          volume: finalVolume,
          reverb: finalReverb,
          echo: finalEcho,
          noise_reduction: finalNoiseReduction,
          special_effect: finalSpecialEffect,
          mastering_enabled,
          mastering_profile,
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
        if (isClonedVoice) recordCloneMetric('clone_tts_error')
        const latency = Date.now() - startTime
        const status = result.status >= 500 || result.status === 404 || result.status === 400 ? result.status : 502
        recordMetric({
          endpoint: '/api/tts',
          method: 'POST',
          statusCode: status,
          latency,
          timestamp: new Date().toISOString(),
          error: result.detail,
        })
        return NextResponse.json(
          {
            error: status === 503 ? 'Voice engine not ready' : 'TTS service error',
            details: result.detail,
            requestId,
            ...(status === 503 ? { hint: 'The local voice models are still loading. Retry in a few seconds.' } : {}),
          },
          { status, headers: { 'X-Request-Id': requestId, ...(status === 503 ? { 'Retry-After': '15' } : {}) } }
        )
      }

      if (isClonedVoice) recordCloneMetric('clone_tts_success')

      const audioBuffer = result.buffer
      const latency = Date.now() - startTime
      setCached(cacheKey, audioBuffer, result.contentType)
      recordMetric({
        endpoint: '/api/tts',
        method: 'POST',
        statusCode: 200,
        latency,
        timestamp: new Date().toISOString(),
        requestId,
        voiceType,
      })
      logger.info('TTS generated successfully', {
        requestId,
        voiceId: voice_id,
        engine: result.engine,
        textLength: textLen,
        audioSize: audioBuffer.byteLength,
        latency,
      })

      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': result.contentType,
          'Content-Length': audioBuffer.byteLength.toString(),
          'X-Generation-Latency': latency.toString(),
          'X-Voice-Type': voiceType,
          ...(result.engine ? { 'X-Voice-Engine': result.engine } : {}),
          'X-Request-Id': requestId,
        },
      })
    } catch (serviceError) {
      const latency = Date.now() - startTime
      const errMsg = serviceError instanceof Error ? serviceError.message : String(serviceError)
      const isUnreachable = isUnreachableError(errMsg)
      const isAborted = isAbortError(errMsg)
      if (isClonedVoice) recordCloneMetric('clone_tts_error')

      recordMetric({
        endpoint: '/api/tts',
        method: 'POST',
        statusCode: 503,
        latency,
        timestamp: new Date().toISOString(),
        error: errMsg,
      })
      logger.error('TTS service error', serviceError, { requestId, ip })

      return NextResponse.json(
        {
          error: 'TTS service error',
          details: errMsg,
          requestId,
          ...(isAborted
            ? {
                hint: usesXtts
                  ? 'XTTS generation timed out. Try shorter text, or run the voice service on a GPU.'
                  : 'TTS request timed out before completion. Try shorter text or retry.',
              }
            : {}),
          ...(isUnreachable
            ? {
                hint: config.isRailway
                  ? 'The voice service is not reachable. Deploy services/xtts as a Railway service and set XTTS_URL to its internal URL. See RAILWAY_DEPLOY.md.'
                  : 'The voice service is not reachable. Start it with `python services/xtts/main.py` (port 8081) or set XTTS_URL.',
              }
            : {}),
        },
        { status: 503, headers: { 'X-Request-Id': requestId } }
      )
    }
  } catch (error) {
    const latency = Date.now() - startTime
    recordMetric({
      endpoint: '/api/tts',
      method: 'POST',
      statusCode: 500,
      latency,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    })

    logger.error('TTS API error', error, { requestId, ip })

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Request failed',
        requestId,
      },
      {
        status: 500,
        headers: {
          'X-Request-Id': requestId,
        },
      }
    )
  }
}
