import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export default auth((req: NextRequest) => {
  // Public routes that don't require auth
  const publicRoutes = [
    "/",
    "/login",
    "/api/tts",
    "/api/voices",
    "/api/clone",
    "/api/clone-voice",
    "/playground",
    "/index.html",
  ]
  
  const pathname = req.nextUrl.pathname
  
  // Create response
  let response = NextResponse.next()

  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  // HSTS (HTTP Strict Transport Security) - Only in production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }
  
  // Permissions Policy (formerly Feature Policy)
  response.headers.set(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  )
  
  // Strict CSP policy - Removed 'unsafe-eval' for security
  // Note: 'unsafe-inline' for scripts is required by Next.js runtime
  // 'unsafe-inline' for styles is required for CSS-in-JS (Tailwind, etc.)
  // TODO: Consider implementing nonces in future Next.js versions
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'", // Next.js requires this - consider nonces in future
    "style-src 'self' 'unsafe-inline'", // CSS-in-JS requires this
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: https:",
    "media-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
    "block-all-mixed-content" // Block mixed HTTP/HTTPS content
  ].join('; ')
  
  response.headers.set('Content-Security-Policy', csp)
  
  // Report-To header for CSP violations (optional, for monitoring)
  if (process.env.CSP_REPORT_URI) {
    response.headers.set(
      'Report-To',
      JSON.stringify({
        group: 'csp-endpoint',
        max_age: 10886400,
        endpoints: [{ url: process.env.CSP_REPORT_URI }]
      })
    )
    response.headers.set('Content-Security-Policy-Report-Only', csp.replace('block-all-mixed-content', ''))
  }
  
  // Allow public routes
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route + "/"))) {
    return response
  }

  // Protected routes require auth (auth attached by NextAuth middleware)
  const reqWithAuth = req as NextRequest & { auth?: { user?: unknown } }
  if (!reqWithAuth.auth && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return response
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
