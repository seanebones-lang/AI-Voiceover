import { NextRequest, NextResponse } from 'next/server'

// Single-user mode: minimal middleware (no session gate). Sensitive reads use
// `allowDiagnosticRoute` in `lib/api-access.ts`; POST mutations can opt into
// `API_ROUTE_SECRET` in the same module.
export function middleware(request: NextRequest) {
  return NextResponse.next()
}
