import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// Check if Redis is configured
const hasRedis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN

const redis = hasRedis ? new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
}) : null

// In-memory rate limiter for fallback (when Redis not configured)
// Uses Map to store request counts per identifier
const inMemoryStore = new Map<string, { count: number; resetTime: number }>()

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of inMemoryStore.entries()) {
    if (value.resetTime < now) {
      inMemoryStore.delete(key)
    }
  }
}, 60000) // Cleanup every minute

// Fallback rate limiter with in-memory storage
const createFallbackLimiter = (windowMs: number, maxRequests: number) => ({
  limit: async (identifier: string) => {
    const now = Date.now()
    const resetTime = now + windowMs
    
    // Get or create entry
    let entry = inMemoryStore.get(identifier)
    
    if (!entry || entry.resetTime < now) {
      // New window or expired entry
      entry = { count: 1, resetTime }
      inMemoryStore.set(identifier, entry)
      return {
        success: true,
        limit: maxRequests,
        remaining: maxRequests - 1,
        reset: resetTime,
      }
    }
    
    // Increment count
    entry.count++
    
    if (entry.count > maxRequests) {
      return {
        success: false,
        limit: maxRequests,
        remaining: 0,
        reset: entry.resetTime,
      }
    }
    
    inMemoryStore.set(identifier, entry)
    
    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests - entry.count,
      reset: entry.resetTime,
    }
  },
})

// Single-user mode: no effective rate limits (high ceilings so they never trigger)
const UNLIMITED_WINDOW_MS = 15 * 60 * 1000
const UNLIMITED_REQUESTS = 100000

// Create rate limiter: effectively unlimited for single user
export const rateLimiter = hasRedis && redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(UNLIMITED_REQUESTS, "15 m"),
  analytics: true,
  prefix: "@upstash/ratelimit",
}) : createFallbackLimiter(UNLIMITED_WINDOW_MS, UNLIMITED_REQUESTS)

// TTS: effectively unlimited for single user
export const ttsRateLimiter = hasRedis && redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(UNLIMITED_REQUESTS, "1 h"),
  analytics: true,
  prefix: "@upstash/ratelimit/tts",
}) : createFallbackLimiter(60 * 60 * 1000, UNLIMITED_REQUESTS)

// Cloning: effectively unlimited for single user
export const cloneRateLimiter = hasRedis && redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(UNLIMITED_REQUESTS, "1 d"),
  analytics: true,
  prefix: "@upstash/ratelimit/clone",
}) : createFallbackLimiter(24 * 60 * 60 * 1000, UNLIMITED_REQUESTS)
