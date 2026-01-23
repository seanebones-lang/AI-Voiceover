/**
 * Voice Cloning API Route (v2)
 * Real voice cloning via speaker embeddings
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCorsHeaders, handleCorsPreflight } from '@/lib/cors'

export const dynamic = 'force-dynamic'

const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || 'http://localhost:8082'

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return handleCorsPreflight(origin)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)
  try {
    // Get form data
    const formData = await request.formData()
    const name = formData.get('name')
    const description = formData.get('description')
    const files = formData.getAll('files')

    // Validation
    const nameValue = typeof name === 'string' ? name.trim() : ''
    if (!nameValue) {
      return NextResponse.json(
        { error: 'Voice name is required' },
        { status: 400, headers: corsHeaders }
      )
    }
    
    if (nameValue.length > 100) {
      return NextResponse.json(
        { error: 'Name too long (max 100 characters)' },
        { status: 400, headers: corsHeaders }
      )
    }

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'At least one audio file is required' },
        { status: 400, headers: corsHeaders }
      )
    }

    if (files.length > 5) {
      return NextResponse.json(
        { error: 'Maximum 5 files allowed' },
        { status: 400, headers: corsHeaders }
      )
    }
    
    // Validate total file size
    const totalSize = files
      .filter((f): f is File => f instanceof File)
      .reduce((sum, file) => sum + file.size, 0)
    const maxTotalSize = 50 * 1024 * 1024 // 50MB
    if (totalSize > maxTotalSize) {
      return NextResponse.json(
        { error: `Total file size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds 50MB limit` },
        { status: 400, headers: corsHeaders }
      )
    }

    // Validate file types
    for (const file of files) {
      if (file instanceof File) {
        const validTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/flac', 'audio/x-m4a']
        const validExtensions = ['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.webm']
        
        const hasValidType = validTypes.includes(file.type) || file.type.startsWith('audio/')
        const hasValidExt = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
        
        if (!hasValidType && !hasValidExt) {
          return NextResponse.json(
            { error: `Invalid file type: ${file.name}` },
            { status: 400 }
          )
        }
      }
    }

    console.log(`🎭 Clone request: name="${name}", files=${files.length}`)

    // Sanitize name
    const sanitizedName = nameValue.replace(/[^a-zA-Z0-9\s_-]/g, '')
    if (sanitizedName.length === 0) {
      return NextResponse.json(
        { error: 'Name contains only invalid characters' },
        { status: 400, headers: corsHeaders }
      )
    }
    
    // Create new FormData for the service
    const serviceFormData = new FormData()
    serviceFormData.append('name', sanitizedName)
    
    if (description && typeof description === 'string') {
      serviceFormData.append('description', description)
    }

    for (const file of files) {
      if (file instanceof File) {
        serviceFormData.append('files', file)
      }
    }

    // Forward to TTS service
    const response = await fetch(`${TTS_SERVICE_URL}/clone`, {
      method: 'POST',
      body: serviceFormData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Clone service error' }))
      console.error('Clone service error:', error)
      return NextResponse.json(
        { error: error.detail || 'Voice cloning failed' },
        { status: response.status, headers: corsHeaders }
      )
    }

    const result = await response.json()
    
    console.log(`✅ Voice cloned: ${result.voice_id}`)

    return NextResponse.json({
      success: true,
      voice_id: result.voice_id,
      name: result.name,
      message: result.message || `Voice "${sanitizedName}" cloned successfully!`,
      quality_warnings: result.quality_warnings,
      recommendations: result.recommendations,
      total_duration: result.total_duration,
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('Clone route error:', error)
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return NextResponse.json(
        { error: 'Voice cloning service unavailable' },
        { status: 503, headers: corsHeaders }
      )
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cloning failed' },
      { status: 500, headers: corsHeaders }
    )
  }
}
