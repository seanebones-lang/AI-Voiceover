import { NextRequest, NextResponse } from 'next/server'

// Placeholder for streaming endpoint
// Real implementation would use Server-Sent Events or WebSocket
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return NextResponse.json(
    { error: 'Streaming not yet implemented' },
    { status: 501 }
  )
}
