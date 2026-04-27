/**
 * Backwards-compatible alias for clients that still call /api/voices-v2.
 * Same handler as /api/voices.
 */
export const dynamic = 'force-dynamic'

export { GET } from '../voices/route'
