/**
 * Security helpers for middleware (sync, no async cookies).
 * Full CSRF utilities live in lib/security/csrf.ts.
 */

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Generate a secure random token (sync for middleware). */
export function generateCSRF(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

/** Validate CSRF: header token must match cookie token (sync). */
export function validateCSRF(headerToken: string, cookieToken: string): boolean {
  if (!headerToken || !cookieToken) return false;
  return constantTimeEquals(headerToken, cookieToken);
}
