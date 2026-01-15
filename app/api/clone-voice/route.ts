import { NextRequest, NextResponse } from 'next/server'
import { cloneRateLimiter } from '@/lib/rate-limit'
import { config, getServiceUrl, withRetry } from '@/lib/config'
import { validateAudioFile, extractClientIP } from '@/lib/validation'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Extract and validate client IP
    const ip = extractClientIP(request)
    
    // Rate limiting
    const { success, limit, remaining, reset } = await cloneRateLimiter.limit(ip)
    
    if (!success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded for voice cloning',
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
          }
        }
      )
    }

    // Get form data from request
    const formData = await request.formData()
    
    // Validate form fields
    const name = formData.get('name')
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    
    if (name.length > 100) {
      return NextResponse.json({ error: 'Name too long (max 100 characters)' }, { status: 400 })
    }
    
    // Validate files
    const files = formData.getAll('files') as File[]
    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'At least one audio file is required' }, { status: 400 })
    }
    
    if (files.length > 5) {
      return NextResponse.json({ error: 'Maximum 5 files allowed' }, { status: 400 })
    }
    
    // Validate each file
    for (const file of files) {
      const validation = validateAudioFile(file)
      if (!validation.valid) {
        return NextResponse.json(
          { error: `Invalid file ${file.name}: ${validation.error}` },
          { status: 400 }
        )
      }
    }
    
    // Forward to XTTS sidecar with retry logic
    const xttsService = config.services.xtts
    const response = await withRetry(async () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), xttsService.timeout)
      
      try {
        const res = await fetch(`${xttsService.url}/clone`, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        })
        clearTimeout(timeout)
        return res
      } catch (error) {
        clearTimeout(timeout)
        throw error
      }
    }, xttsService.retries, 2000, 2)

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
