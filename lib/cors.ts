/**
 * CORS Configuration Utility
 * Provides secure CORS headers for Next.js API routes
 */

/**
 * Get allowed origins from environment variable
 * Falls back to single origin if not configured
 */
export function getAllowedOrigins(): string[] {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
  
  if (!allowedOrigins) {
    // Default to same origin only (most secure)
    return []
  }
  
  // Support comma-separated list of origins
  return allowedOrigins
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0)
}

/**
 * Check if origin is allowed
 */
export function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) {
    // Same-origin requests (no Origin header)
    return true
  }
  
  if (allowedOrigins.length === 0) {
    // No explicit origins configured - allow same origin only
    return false
  }
  
  return allowedOrigins.includes(origin)
}

/**
 * Get CORS headers for response
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = getAllowedOrigins()
  const headers: Record<string, string> = {}
  
  if (isOriginAllowed(origin, allowedOrigins)) {
    headers['Access-Control-Allow-Origin'] = origin || '*'
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    headers['Access-Control-Allow-Credentials'] = 'true'
    headers['Access-Control-Max-Age'] = '86400' // 24 hours
  }
  
  return headers
}

/**
 * Handle CORS preflight request
 */
export function handleCorsPreflight(origin: string | null) {
  const allowedOrigins = getAllowedOrigins()
  
  if (!isOriginAllowed(origin, allowedOrigins)) {
    return new Response(null, { status: 403 })
  }
  
  const headers = getCorsHeaders(origin)
  return new Response(null, { 
    status: 204,
    headers 
  })
}
