/**
 * CSRF Protection Utility
 * Implements double-submit cookie pattern for CSRF protection
 */

import { cookies } from 'next/headers'

const CSRF_TOKEN_COOKIE = 'csrf-token'
const CSRF_TOKEN_HEADER = 'X-CSRF-Token'

/**
 * Generate a secure random CSRF token
 */
export function generateCSRFToken(): string {
  // Use crypto.randomBytes for secure random generation
  const array = new Uint8Array(32)
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(array)
  } else {
    // Node.js fallback
    const crypto = require('crypto')
    crypto.randomFillSync(array)
  }
  
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Set CSRF token in cookie (for double-submit pattern)
 */
export async function setCSRFToken(): Promise<string> {
  const token = generateCSRFToken()
  const cookieStore = await cookies()
  
  cookieStore.set(CSRF_TOKEN_COOKIE, token, {
    httpOnly: false, // Must be readable by JavaScript for double-submit
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  })
  
  return token
}

/**
 * Get CSRF token from cookie
 */
export async function getCSRFToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(CSRF_TOKEN_COOKIE)?.value || null
}

/**
 * Validate CSRF token from request
 * Implements double-submit cookie pattern:
 * 1. Token in cookie (set by server)
 * 2. Token in header/body (sent by client)
 * Both must match
 */
export async function validateCSRFToken(
  requestToken: string | null
): Promise<boolean> {
  if (!requestToken) {
    return false
  }
  
  const cookieToken = await getCSRFToken()
  
  if (!cookieToken) {
    return false
  }
  
  // Constant-time comparison to prevent timing attacks
  return constantTimeEquals(cookieToken, requestToken)
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  
  return result === 0
}

/**
 * Extract CSRF token from request headers or body
 */
export function extractCSRFTokenFromRequest(
  headers: Headers,
  body?: Record<string, unknown>
): string | null {
  // Check header first
  const headerToken = headers.get(CSRF_TOKEN_HEADER)
  if (headerToken) {
    return headerToken
  }
  
  // Check body
  if (body && typeof body === 'object' && CSRF_TOKEN_HEADER in body) {
    const bodyToken = body[CSRF_TOKEN_HEADER]
    return typeof bodyToken === 'string' ? bodyToken : null
  }
  
  return null
}
