import { NextRequest, NextResponse } from 'next/server'
import { XTTSClient } from '@/lib/tts/xtts-client'
import { cloneRateLimiter } from '@/lib/rate-limit'

const xttsClient = new XTTSClient(process.env.XTTS_SIDECAR_URL || 'http://localhost:8081')

export async function POST(request: NextRequest) {
  try {
    // Rate limiting (stricter for cloning)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1'
    const { success, limit, remaining, reset } = await cloneRateLimiter.limit(ip)
    
    if (!success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded for voice cloning',
          limit,
          remaining,
          reset: new Date(reset).toISOString(),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
          },
        }
      )
    }

    // Check if XTTS service is available
    const isHealthy = await xttsClient.healthCheck()
    if (!isHealthy) {
      return NextResponse.json(
        { error: 'Voice cloning service is not available' },
        { status: 503 }
      )
    }

    const formData = await request.formData()
    const name = formData.get('name') as string
    const description = formData.get('description') as string | null
    const files = formData.getAll('files') as File[]

    // Validation
    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Voice name is required' },
        { status: 400 }
      )
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'At least one audio file is required' },
        { status: 400 }
      )
    }

    if (files.length > 5) {
      return NextResponse.json(
        { error: 'Maximum 5 files allowed' },
        { status: 400 }
      )
    }

    // Validate file sizes
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Total file size exceeds 50MB limit' },
        { status: 400 }
      )
    }

    // Clone voice via XTTS sidecar
    const result = await xttsClient.cloneVoice({
      name: name.trim(),
      description: description?.trim() || undefined,
      files,
    })

    console.log(`✓ Voice cloned: ${result.voice_id}`)

    return NextResponse.json({
      ...result,
      rateLimit: {
        limit,
        remaining: remaining - 1,
        reset: new Date(reset).toISOString(),
      },
    })
  } catch (error) {
    console.error('Voice cloning error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to clone voice',
      },
      { status: 500 }
    )
  }
}
