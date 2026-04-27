import { NextRequest, NextResponse } from 'next/server'
import { denyUnlessMutableApiAuthorized } from '@/lib/api-access'
import { ttsRateLimiter } from '@/lib/rate-limit'
import { config, withRetry } from '@/lib/config'
import { validateTTSRequest, extractClientIP, CLONED_TTS_MAX_CHARS } from '@/lib/validation'
import { logger, generateRequestId, recordMetric, recordCloneMetric } from '@/lib/monitoring'
import { buildTtsCacheKey, getCached, setCached } from '@/lib/tts-cache'
import { applyEmotionProsody } from '@/lib/tts/emotion-prosody'
import { synthesizeEdge, isEdgeVoice } from '@/lib/edgeTtsService'
import { synthesizeEdgeTts as synthesizeEdgeFallback } from '@/lib/edgeTtsFallback'
import { Buffer } from 'node:buffer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Allow long-running cloned-voice XTTS synthesis on Vercel.
export const maxDuration = 300

interface TTSRequest {
  text: string
  voice_id: string
  speed?: number
  pitch?: number
  volume?: number
  language?: string
  // Audio effects
  reverb?: number
  echo?: number
  noise_reduction?: boolean
  // Special effects
  special_effect?: string // 'none' | 'robot' | 'radio' | 'whisper' | 'deep' | 'chipmunk' | 'cave' | 'telephone'
}

function extractWavData(buffer: Buffer): { fmtChunk: Buffer; dataChunk: Buffer } | null {
  if (buffer.length < 44) return null
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null
  if (buffer.toString('ascii', 8, 12) !== 'WAVE') return null

  let offset = 12
  let fmtChunk: Buffer | null = null
  let dataChunk: Buffer | null = null

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkSize

    if (chunkEnd > buffer.length) break

    if (chunkId === 'fmt ') {
      fmtChunk = buffer.subarray(chunkStart, chunkEnd)
    } else if (chunkId === 'data') {
      dataChunk = buffer.subarray(chunkStart, chunkEnd)
    }

    offset = chunkEnd + (chunkSize % 2)
  }

  if (!fmtChunk || !dataChunk) return null
  return { fmtChunk, dataChunk }
}

function mergeWavBuffers(buffers: ArrayBuffer[]): ArrayBuffer | null {
  if (!buffers.length) return null
  if (buffers.length === 1) return buffers[0]

  const parsed = buffers.map((ab) => extractWavData(Buffer.from(ab)))
  if (parsed.some((p) => !p)) return null

  const fmtChunk = parsed[0]!.fmtChunk
  const dataPayload = Buffer.concat(parsed.map((p) => p!.dataChunk))
  const riffSize = 4 + (8 + fmtChunk.length) + (8 + dataPayload.length)
  const output = Buffer.alloc(12 + (8 + fmtChunk.length) + (8 + dataPayload.length))

  output.write('RIFF', 0, 4, 'ascii')
  output.writeUInt32LE(riffSize, 4)
  output.write('WAVE', 8, 4, 'ascii')

  let offset = 12
  output.write('fmt ', offset, 4, 'ascii')
  output.writeUInt32LE(fmtChunk.length, offset + 4)
  fmtChunk.copy(output, offset + 8)
  offset += 8 + fmtChunk.length

  output.write('data', offset, 4, 'ascii')
  output.writeUInt32LE(dataPayload.length, offset + 4)
  dataPayload.copy(output, offset + 8)

  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength)
}

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
        requestedVoiceId?.startsWith('clone_') &&
        (rawValidationError.includes('Cloned voice text must') ||
          rawValidationError.includes(String(CLONED_TTS_MAX_CHARS)))
      return NextResponse.json(
        {
          error: clonedTextLimitExceeded
            ? 'Cloned voice input is too long for one request'
            : rawValidationError,
          ...(clonedTextLimitExceeded
            ? {
                hint: `Keep each cloned-voice request under ${CLONED_TTS_MAX_CHARS} characters for reliable synthesis (one XTTS job). Use batch mode or split the script.`,
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
      temperature: ttsTemperature,
      repetition_penalty: ttsRepetitionPenalty,
      top_k: ttsTopK,
      top_p: ttsTopP,
    } = validation.data

    const prosody = applyEmotionProsody(
      { speed, pitch, volume, reverb, echo, noise_reduction, special_effect },
      emotion
    )

    const cloneTuneKey =
      voice_id.startsWith('clone_')
        ? [
            clone_preset ?? 'natural',
            ttsTemperature !== undefined ? String(ttsTemperature) : '_',
            ttsRepetitionPenalty !== undefined ? String(ttsRepetitionPenalty) : '_',
            ttsTopK !== undefined ? String(ttsTopK) : '_',
            ttsTopP !== undefined ? String(ttsTopP) : '_',
          ].join(':')
        : ''

    let finalSpeed = prosody.speed
    let finalPitch = prosody.pitch
    let finalVolume = prosody.volume
    let finalReverb = prosody.reverb
    let finalEcho = prosody.echo
    let finalNoiseReduction = prosody.noise_reduction
    let finalSpecialEffect = prosody.special_effect

    const cacheKey = buildTtsCacheKey({
      text: text.trim(),
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
      emotion,
    })
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
        voiceType: voice_id.startsWith('clone_') ? 'cloned' : 'standard',
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

    console.log(`🎤 TTS: voice=${voice_id}, speed=${finalSpeed}, pitch=${finalPitch}, volume=${finalVolume}`)

    const effectsRequested =
      finalReverb > 0 ||
      finalEcho > 0 ||
      finalNoiseReduction ||
      finalSpecialEffect !== 'none'

    // Route DEFAULT_VOICES (edge-tts source) to Edge TTS
    // Important: when effects are requested, route through XTTS sidecar so
    // ffmpeg-based post-processing is actually applied.
    if (isEdgeVoice(voice_id) && !effectsRequested) {
      // Try WebSocket-based Edge TTS first, then fall back to edge-tts-universal
      let mp3: Buffer | null = null
      let edgeMethod = 'websocket'

      try {
        mp3 = await synthesizeEdge({ text: text.trim(), voiceId: voice_id, speed: finalSpeed, pitch: finalPitch })
      } catch (wsErr) {
        logger.warn('Edge TTS WebSocket failed, trying edge-tts-universal fallback', { requestId, error: wsErr instanceof Error ? wsErr.message : String(wsErr) })
      }

      if (!mp3) {
        try {
          edgeMethod = 'universal'
          mp3 = await synthesizeEdgeFallback(text.trim(), voice_id, { speed: finalSpeed, pitch: finalPitch, volume: finalVolume })
        } catch (fallbackErr) {
          const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
          logger.error('Edge TTS fallback also failed', fallbackErr, { requestId })
          return NextResponse.json({ error: 'Edge TTS failed', details: msg, requestId }, { status: 503, headers: { 'X-Request-Id': requestId } })
        }
      }

      const latency = Date.now() - startTime
      const buf = new Uint8Array(mp3).buffer as ArrayBuffer
      setCached(cacheKey, buf, 'audio/mpeg')
      recordMetric({ endpoint: '/api/tts', method: 'POST', statusCode: 200, latency, timestamp: new Date().toISOString(), requestId, voiceType: 'standard' })
      return new NextResponse(new Uint8Array(mp3), {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': mp3.byteLength.toString(),
          'X-Generation-Latency': latency.toString(),
          'X-Voice-Type': `edge-tts-${edgeMethod}`,
          'X-Request-Id': requestId,
        },
      })
    }

    try {
      const xttsService = config.services.xtts
      const isClonedVoice = voice_id.startsWith('clone_')
      if (isClonedVoice) {
        recordCloneMetric('clone_tts_requested')
      }

      const normalizedText = text.trim()
      const textLen = normalizedText.length
      const hasEffects =
        finalReverb > 0 ||
        finalEcho > 0 ||
        finalNoiseReduction ||
        finalSpecialEffect !== 'none' ||
        finalVolume !== 1.0
      // One request per generation: XTTS splits internally (sentence-aware) and merges once.
      // Double-chunking here caused extra HTTP hops and rougher seams without improving timeouts.
      const chunkedTexts = [normalizedText]

      if (isClonedVoice && textLen > CLONED_TTS_MAX_CHARS) {
        return NextResponse.json(
          {
            error: 'Cloned voice text too long for synchronous generation',
            requestId,
            maxChars: CLONED_TTS_MAX_CHARS,
            receivedChars: textLen,
            hint: 'Split into shorter sections (or use batch mode). For very long content, use a GPU XTTS host or multiple requests.',
          },
          {
            status: 413,
            headers: {
              'X-Request-Id': requestId,
            },
          }
        )
      }

      const dynamicTimeoutMs = (() => {
        let timeout = xttsService.timeout
        // Cloned voice inference on CPU can exceed 30s for multi-sentence text.
        if (isClonedVoice) {
          // Give CPU-based XTTS enough time for long-form synthesis in one attempt.
          timeout = Math.max(timeout, 150_000)
          timeout += Math.min(120_000, Math.floor(textLen / 80) * 6_000)
        }
        if (hasEffects) timeout += 10_000
        // Keep fetch timeout below function maxDuration (300s) for cleanup/response.
        return Math.min(timeout, 270_000)
      })()

      // Retrying cloned-voice synthesis can duplicate multi-minute XTTS work and
      // push total request time past gateway limits. Keep it single-attempt.
      const retryCount = isClonedVoice ? 0 : xttsService.retries

      const chunkBuffers: ArrayBuffer[] = []
      let contentType = 'audio/wav'

      for (let chunkIndex = 0; chunkIndex < chunkedTexts.length; chunkIndex++) {
        const xttsResponse = await withRetry(async () => {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), dynamicTimeoutMs)
          
          try {
            const response = await fetch(`${xttsService.url}/tts`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Request-Id': `${requestId}-c${chunkIndex + 1}`,
              },
              body: JSON.stringify({
                text: chunkedTexts[chunkIndex],
                voice_id,
                language,
                speed: finalSpeed,
                pitch: finalPitch,
                volume: finalVolume,
                reverb: finalReverb,
                echo: finalEcho,
                noise_reduction: finalNoiseReduction,
                special_effect: finalSpecialEffect,
                ...(isClonedVoice
                  ? {
                      ...(clone_preset ? { clone_preset } : {}),
                      ...(ttsTemperature !== undefined ? { temperature: ttsTemperature } : {}),
                      ...(ttsRepetitionPenalty !== undefined ? { repetition_penalty: ttsRepetitionPenalty } : {}),
                      ...(ttsTopK !== undefined ? { top_k: ttsTopK } : {}),
                      ...(ttsTopP !== undefined ? { top_p: ttsTopP } : {}),
                    }
                  : {}),
              }),
              signal: controller.signal,
            })
            
            clearTimeout(timeout)
            return response
          } catch (error) {
            clearTimeout(timeout)
            throw error
          }
        }, retryCount, 1000, 2)

        if (!xttsResponse.ok) {
          if (voice_id.startsWith('clone_')) {
            recordCloneMetric('clone_tts_error')
          }
          const error = await xttsResponse.json().catch(() => ({ detail: 'TTS failed' }))
          throw new Error(error.detail || `TTS sidecar returned ${xttsResponse.status}`)
        }

        contentType = xttsResponse.headers.get('content-type') || contentType
        chunkBuffers.push(await xttsResponse.arrayBuffer())
      }

      if (voice_id.startsWith('clone_')) {
        recordCloneMetric('clone_tts_success')
      }

      const mergedAudioBuffer = chunkBuffers.length > 1
        ? mergeWavBuffers(chunkBuffers)
        : chunkBuffers[0]
      if (!mergedAudioBuffer) {
        throw new Error('Failed to merge chunked cloned-voice audio')
      }

      const audioBuffer = mergedAudioBuffer
      const latency = Date.now() - startTime
      setCached(cacheKey, audioBuffer, contentType)

      recordMetric({
        endpoint: '/api/tts',
        method: 'POST',
        statusCode: 200,
        latency,
        timestamp: new Date().toISOString(),
        requestId,
        voiceType: voice_id.startsWith('clone_') ? 'cloned' : 'standard',
      })

      logger.info('TTS generated successfully', {
        requestId,
        voiceId: voice_id,
        textLength: text.length,
        audioSize: audioBuffer.byteLength,
        latency,
      })

      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': audioBuffer.byteLength.toString(),
          'X-Generation-Latency': latency.toString(),
          'X-Voice-Type': voice_id.startsWith('clone_') ? 'cloned' : 'standard',
          'X-Request-Id': requestId,
        },
      })
    } catch (sidecarError) {
      const latency = Date.now() - startTime
      const errMsg = sidecarError instanceof Error ? sidecarError.message : String(sidecarError)
      const isUnreachable =
        /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|connection refused/i.test(errMsg)
      const isAborted = /abort|aborted/i.test(errMsg)

      // Self-contained: no external fallback. Return 503 when XTTS is unreachable.
      recordMetric({
        endpoint: '/api/tts',
        method: 'POST',
        statusCode: 503,
        latency,
        timestamp: new Date().toISOString(),
        error: errMsg,
      })

      logger.error('TTS service error', sidecarError, { requestId, ip })

      return NextResponse.json(
        {
          error: 'TTS service error',
          details: errMsg,
          requestId,
          ...(isAborted
            ? {
                hint: voice_id.startsWith('clone_')
                  ? 'Cloned-voice generation timed out before XTTS completed. Try shorter text/chunking, or use a faster XTTS runtime (GPU).'
                  : 'TTS request timed out before completion. Try shorter text or retry.',
              }
            : {}),
          ...(isUnreachable && config.isRailway
            ? {
                hint: voice_id.startsWith('clone_')
                  ? 'Cloning requires XTTS. Deploy the XTTS service and set XTTS_URL, or check GET /api/health for capabilities.'
                  : 'XTTS voice service is not reachable. Add and deploy the XTTS service (services/xtts) as a second Railway service, or set XTTS_URL to its internal URL. See RAILWAY_DEPLOY.md.',
              }
            : {}),
        },
        {
          status: 503,
          headers: {
            'X-Request-Id': requestId,
          },
        }
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
        }
      }
    )
  }
}
