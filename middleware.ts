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
  
  // Strict CSP policy - Removed 'unsafe-eval' for security
  // Note: 'unsafe-inline' for scripts is required by Next.js runtime
  // 'unsafe-inline' for styles is required for CSS-in-JS (Tailwind, etc.)
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'", // Next.js requires this
    "style-src 'self' 'unsafe-inline'", // CSS-in-JS requires this
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: https:",
    "media-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests"
  ].join('; ')
  
  response.headers.set('Content-Security-Policy', csp)
  
  // Allow public routes
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route + "/"))) {
    return response
  }

  // Protected routes require auth
  if (!req.auth && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return response
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
