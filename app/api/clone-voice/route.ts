import { NextRequest, NextResponse } from 'next/server'
import { cloneRateLimiter } from '@/lib/rate-limit'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const XTTS_URL = process.env.XTTS_SIDECAR_URL || 'http://localhost:8081'

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
               request.headers.get('x-real-ip') || '127.0.0.1'
    const { success, limit, remaining, reset } = await cloneRateLimiter.limit(ip)
    
    if (!success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded for voice cloning',
          limit,
          remaining,
          reset: new Date(reset).toISOString(),
        },
        { status: 429 }
      )
    }

    // Get form data from request
    const formData = await request.formData()
    
    // Forward to XTTS sidecar
    const response = await fetch(`${XTTS_URL}/clone`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Clone service error' }))
      return NextResponse.json(
        { error: error.detail || 'Voice cloning failed' },
        { status: response.status }
      )
    }

    const result = await response.json()
    
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
      { error: error instanceof Error ? error.message : 'Failed to clone voice' },
      { status: 500 }
    )
  }
}
