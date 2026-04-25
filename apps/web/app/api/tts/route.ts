import { NextRequest, NextResponse } from 'next/server'
import { denyUnlessMutableApiAuthorized } from '@/lib/api-access'
import { ttsRateLimiter } from '@/lib/rate-limit'
import { VoiceCloningRAGIntegration } from '@/lib/rag/voice-cloning-rag'
import { config, getServiceUrl, withRetry } from '@/lib/config'
import { validateTTSRequest, extractClientIP } from '@/lib/validation'
import { logger, generateRequestId, recordMetric, recordCloneMetric } from '@/lib/monitoring'
import { buildTtsCacheKey, getCached, setCached } from '@/lib/tts-cache'
import { synthesizeEdge, isEdgeVoice } from '@/lib/edgeTtsService'
import { synthesizeEdgeTts as synthesizeEdgeFallback } from '@/lib/edgeTtsFallback'

export const dynamic = 'force-dynamic'

// Initialize RAG integration for TTS enhancement
const ragIntegration = new VoiceCloningRAGIntegration(
  getServiceUrl('rag')
)

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
  // User tracking
  user_id?: string
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
      return NextResponse.json(
        { error: validation.error || 'Validation failed' },
        { status: 400 }
      )
    }

    const {
      text, voice_id, language = 'en',
      speed = 1.0, pitch = 0, volume = 1.0,
      reverb = 0, echo = 0, noise_reduction = false,
      special_effect = 'none',
      user_id
    } = validation.data

    // 🎯 RAG ENHANCEMENT: Analyze text and optimize TTS parameters
    const ttsEnhancement = await ragIntegration.enhanceTTSGeneration(
      text.trim(),
      voice_id,
      undefined, // context
      user_id
    ).catch(() => ({ rag_enhanced: false, tts_parameters: null }))

    // Apply RAG-enhanced parameters if available
    let finalSpeed = speed
    let finalPitch = pitch
    let finalVolume = volume
    let finalReverb = reverb
    let finalEcho = echo
    let finalNoiseReduction = noise_reduction
    let finalSpecialEffect = special_effect

    if (ttsEnhancement.rag_enhanced && ttsEnhancement.tts_parameters) {
      const params = ttsEnhancement.tts_parameters
      finalSpeed = params.speed
      finalPitch = params.pitch ?? pitch
      finalVolume = params.volume ?? volume

      // Apply emotion-based effects
      if (params.emotion_enhancement === 'excited') {
        finalSpecialEffect = 'none' // Keep natural but enhanced
        finalVolume = Math.max(finalVolume, 1.1)
      } else if (params.emotion_enhancement === 'calm') {
        finalNoiseReduction = true
        finalReverb = Math.min(finalReverb + 0.1, 0.3)
      }

      console.log(`✅ RAG Enhanced TTS: speed=${finalSpeed}, emotion=${params.emotion_enhancement}`)
    }

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

      const textLen = text.trim().length
      const hasEffects =
        finalReverb > 0 ||
        finalEcho > 0 ||
        finalNoiseReduction ||
        finalSpecialEffect !== 'none' ||
        finalVolume !== 1.0
      const dynamicTimeoutMs = (() => {
        let timeout = xttsService.timeout
        // Cloned voice inference on CPU can exceed 30s for multi-sentence text.
        if (isClonedVoice) {
          timeout = Math.max(timeout, 90_000)
          timeout += Math.min(90_000, Math.floor(textLen / 80) * 4_000)
        }
        if (hasEffects) timeout += 10_000
        return Math.min(timeout, 240_000)
      })()

      const retryCount = isClonedVoice ? 1 : xttsService.retries

      const xttsResponse = await withRetry(async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), dynamicTimeoutMs)
        
        try {
          const response = await fetch(`${xttsService.url}/tts`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Request-Id': requestId,
            },
            body: JSON.stringify({
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
              rag_enhancement: ttsEnhancement.rag_enhanced ? ttsEnhancement : undefined,
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

      if (voice_id.startsWith('clone_')) {
        recordCloneMetric('clone_tts_success')
      }

      const audioBuffer = await xttsResponse.arrayBuffer()
      const latency = Date.now() - startTime
      const contentType = xttsResponse.headers.get('content-type') || 'audio/mpeg'
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
