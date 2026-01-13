import { NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const XTTS_URL = process.env.XTTS_SIDECAR_URL || 'http://localhost:8081'

export async function GET() {
  try {
    const response = await fetch(`${XTTS_URL}/voices`)
    
    if (!response.ok) {
      // Return empty list if service unavailable
      return NextResponse.json({ voices: [] })
    }

    const data = await response.json()
    
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching cloned voices:', error)
    // Return empty list on error
    return NextResponse.json({ voices: [] })
  }
}
