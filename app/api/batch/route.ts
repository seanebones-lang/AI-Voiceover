/**
 * Batch TTS API Route
 * Process multiple texts in one request
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || 'http://localhost:8082'

interface BatchItem {
  text: string
  voice_id?: string
  emotion?: string
  language?: string
}

interface BatchRequest {
  texts: BatchItem[]
  output_format?: 'separate' | 'combined'
}

export async function POST(request: NextRequest) {
  try {
    const body: BatchRequest = await request.json()

    if (!body.texts || !Array.isArray(body.texts) || body.texts.length === 0) {
      return NextResponse.json(
        { error: 'texts array is required' },
        { status: 400 }
      )
    }

    if (body.texts.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 texts per batch' },
        { status: 400 }
      )
    }

    console.log(`📦 Batch request: ${body.texts.length} items`)

    // Submit batch to TTS service
    const response = await fetch(`${TTS_SERVICE_URL}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texts: body.texts,
        combine: body.output_format === 'combined',
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: error.detail || 'Batch processing failed' },
        { status: response.status }
      )
    }

    const result = await response.json()
    
    return NextResponse.json(result)

  } catch (error) {
    console.error('Batch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Batch failed' },
      { status: 500 }
    )
  }
}

// Get batch status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const batchId = searchParams.get('id')

  if (!batchId) {
    return NextResponse.json(
      { error: 'Batch ID required' },
      { status: 400 }
    )
  }

  try {
    const response = await fetch(`${TTS_SERVICE_URL}/batch/${batchId}`)
    
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(await response.json())

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get batch status' },
      { status: 500 }
    )
  }
}
