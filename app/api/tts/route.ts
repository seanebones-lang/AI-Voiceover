import { NextRequest, NextResponse } from 'next/server'
import { ttsRateLimiter } from '@/lib/rate-limit'
import { VoiceCloningRAGIntegration } from '@/lib/rag/voice-cloning-rag'
import { config, getServiceUrl, withRetry } from '@/lib/config'
import { validateTTSRequest, extractClientIP } from '@/lib/validation'
import { logger, generateRequestId, recordMetric } from '@/lib/monitoring'

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
  const startTime = Date.now()
  const requestId = generateRequestId()
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
    console.log('🎯 Enhancing TTS with RAG analysis...')
    const ttsEnhancement = await ragIntegration.enhanceTTSGeneration(
      text.trim(),
      voice_id,
      undefined, // context
      user_id
    )

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

    console.log(`🎤 TTS: voice=${voice_id}, speed=${finalSpeed}, pitch=${finalPitch}, volume=${finalVolume}`)
    
    try {
      const xttsService = config.services.xtts
      const xttsResponse = await withRetry(async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), xttsService.timeout)
        
        try {
          const response = await fetch(`${xttsService.url}/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
      }, xttsService.retries, 1000, 2)

      if (!xttsResponse.ok) {
        const error = await xttsResponse.json().catch(() => ({ detail: 'TTS failed' }))
        throw new Error(error.detail || `TTS sidecar returned ${xttsResponse.status}`)
      }

      const audioBuffer = await xttsResponse.arrayBuffer()
      const latency = Date.now() - startTime
      const contentType = xttsResponse.headers.get('content-type') || 'audio/mpeg'

      recordMetric({
        endpoint: '/api/tts',
        method: 'POST',
        statusCode: 200,
        latency,
        timestamp: new Date().toISOString(),
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
      recordMetric({
        endpoint: '/api/tts',
        method: 'POST',
        statusCode: 503,
        latency,
        timestamp: new Date().toISOString(),
        error: sidecarError instanceof Error ? sidecarError.message : String(sidecarError),
      })
      
      logger.error('TTS service error', sidecarError, { requestId, ip })
      
      return NextResponse.json(
        { 
          error: 'TTS service error', 
          details: sidecarError instanceof Error ? sidecarError.message : String(sidecarError),
          requestId,
        },
        { 
          status: 503,
          headers: {
            'X-Request-Id': requestId,
          }
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
