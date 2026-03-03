import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/** Optional API key check; pass through if no key configured. */
export function middleware(request: NextRequest) {
  const apiKey = process.env.API_KEY
  if (apiKey && request.headers.get('x-api-key') !== apiKey) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 })
  }
  return NextResponse.next()
}
