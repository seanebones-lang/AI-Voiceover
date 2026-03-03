import { NextRequest, NextResponse } from 'next/server'

// Single-user mode: minimal middleware, no auth or paywall
export function middleware(request: NextRequest) {
  return NextResponse.next()
}
