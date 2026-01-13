import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// Check if Redis is configured
const hasRedis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN

const redis = hasRedis ? new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
}) : null

// Fallback rate limiter that always allows (when Redis not configured)
const createFallbackLimiter = () => ({
  limit: async (_identifier: string) => ({
    success: true,
    limit: 100,
    remaining: 99,
    reset: Date.now() + 60000,
  }),
})

// Create rate limiter: 100 requests per 15 minutes
export const rateLimiter = hasRedis && redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "15 m"),
  analytics: true,
  prefix: "@upstash/ratelimit",
}) : createFallbackLimiter()

// Stricter limiter for TTS: 50 requests per hour
export const ttsRateLimiter = hasRedis && redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(50, "1 h"),
  analytics: true,
  prefix: "@upstash/ratelimit/tts",
}) : createFallbackLimiter()

// Very strict limiter for cloning: 10 requests per day
export const cloneRateLimiter = hasRedis && redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 d"),
  analytics: true,
  prefix: "@upstash/ratelimit/clone",
}) : createFallbackLimiter()
