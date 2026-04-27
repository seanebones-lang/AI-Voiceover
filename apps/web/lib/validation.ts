/**
 * Input Validation & Sanitization
 * Comprehensive validation for all API inputs
 * Date: March 2026
 */

import { z } from 'zod'
import { ttsEmotionIds } from '@/lib/tts/emotion-prosody'

/** Max chars for one synchronous cloned-voice request (XTTS + gateway budgets). */
export const CLONED_TTS_MAX_CHARS = 2200

/** Max chars for standard / edge voices in one request. */
export const STANDARD_TTS_MAX_CHARS = 5000

function textSecurityRefine(text: string): boolean {
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /data:text\/html/i,
  ]
  return !suspiciousPatterns.some((pattern) => pattern.test(text))
}

/** Base text: min length + XSS-style patterns (no max — limit enforced per voice type below). */
const ttsTextBaseSchema = z
  .string()
  .min(1, 'Text cannot be empty')
  .refine(textSecurityRefine, 'Text contains potentially unsafe content')

// Generic schema (e.g. tests, non-TTS): standard cap only (must stay ZodString — refine-only schemas have no .max)
export const textSchema = z
  .string()
  .min(1, 'Text cannot be empty')
  .max(STANDARD_TTS_MAX_CHARS, `Text must be ${STANDARD_TTS_MAX_CHARS} characters or less`)
  .refine(textSecurityRefine, 'Text contains potentially unsafe content')

// Voice ID validation
export const voiceIdSchema = z.string()
  .min(1, 'Voice ID is required')
  .max(100, 'Voice ID too long')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Voice ID contains invalid characters')

// Language code validation
export const languageSchema = z.string()
  .length(2, 'Language code must be 2 characters')
  .regex(/^[a-z]{2}$/, 'Invalid language code format')

// Numeric parameter validation
export const speedSchema = z.number()
  .min(0.5, 'Speed must be at least 0.5x')
  .max(2.0, 'Speed must be at most 2.0x')

export const pitchSchema = z.number()
  .min(-20, 'Pitch must be at least -20 semitones')
  .max(20, 'Pitch must be at most 20 semitones')

export const volumeSchema = z.number()
  .min(0.0, 'Volume must be at least 0.0')
  .max(1.0, 'Volume must be at most 1.0')

export const reverbSchema = z.number()
  .min(0, 'Reverb must be at least 0')
  .max(1, 'Reverb must be at most 1')

export const echoSchema = z.number()
  .min(0, 'Echo must be at least 0')
  .max(1, 'Echo must be at most 1')

// Special effect validation
export const specialEffectSchema = z.enum([
  'none',
  'robot',
  'radio',
  'whisper',
  'deep',
  'chipmunk',
  'cave',
  'telephone',
  'underwater',
  'megaphone'
])

// TTS Request validation schema
export const clonePresetSchema = z.enum(['natural', 'expressive', 'stable'])

export const emotionSchema = z
  .enum(ttsEmotionIds as unknown as [string, ...string[]])
  .optional()
  .default('neutral')

export const ttsRequestSchema = z
  .object({
    text: ttsTextBaseSchema,
    voice_id: voiceIdSchema,
    language: languageSchema.optional().default('en'),
    speed: speedSchema.optional().default(1.0),
    pitch: pitchSchema.optional().default(0),
    volume: volumeSchema.optional().default(1.0),
    reverb: reverbSchema.optional().default(0),
    echo: echoSchema.optional().default(0),
    noise_reduction: z.boolean().optional().default(false),
    special_effect: specialEffectSchema.optional().default('none'),
    /** Prosody preset; merged server-side via applyEmotionProsody. */
    emotion: emotionSchema,
    user_id: z.string().max(100).optional(),
    /** XTTS clone presets (cloned voices only; forwarded to sidecar). */
    clone_preset: clonePresetSchema.optional(),
    /** Advanced XTTS sampling (optional; omit to use service defaults). */
    temperature: z.number().min(0.35).max(1.15).optional(),
    repetition_penalty: z.number().min(1.0).max(2.5).optional(),
    top_k: z.number().int().min(10).max(100).optional(),
    top_p: z.number().min(0.65).max(0.99).optional(),
  })
  .superRefine((data, ctx) => {
    const max = data.voice_id.startsWith('clone_') ? CLONED_TTS_MAX_CHARS : STANDARD_TTS_MAX_CHARS
    if (data.text.length > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['text'],
        message: data.voice_id.startsWith('clone_')
          ? `Cloned voice text must be ${max} characters or less for reliable synthesis. Use batch mode or split your script into sections.`
          : `Text must be ${STANDARD_TTS_MAX_CHARS} characters or less`,
      })
    }
  })

// Voice cloning request validation
export const cloneRequestSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name too long')
    .regex(/^[a-zA-Z0-9\s_-]+$/, 'Name contains invalid characters'),
  description: z.string().max(500).optional(),
  files: z.array(z.instanceof(File))
    .min(1, 'At least one audio file is required')
    .max(5, 'Maximum 5 files allowed'),
})

// File validation
export function validateAudioFile(file: File): { valid: boolean; error?: string } {
  // Check file size (max 50MB per file)
  const maxSize = 50 * 1024 * 1024 // 50MB
  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 50MB limit' }
  }
  
  if (file.size < 1000) {
    return { valid: false, error: 'File too small (minimum 1KB)' }
  }
  
  // Check MIME type
  const validMimeTypes = [
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/mpeg',
    'audio/mp3',
    'audio/flac',
    'audio/ogg',
    'audio/webm',
    'audio/m4a',
    'audio/x-m4a',
  ]
  
  if (!validMimeTypes.includes(file.type)) {
    // Check extension as fallback
    const validExtensions = ['.wav', '.mp3', '.flac', '.ogg', '.webm', '.m4a']
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
    if (!validExtensions.includes(extension)) {
      return { valid: false, error: 'Invalid audio file format' }
    }
  }
  
  return { valid: true }
}

// Validate total file size for voice cloning
export function validateTotalFileSize(files: File[], maxTotalSizeMB: number = 50): { valid: boolean; error?: string; totalSizeMB?: number } {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  const totalSizeMB = totalSize / (1024 * 1024)
  
  if (totalSizeMB > maxTotalSizeMB) {
    return { 
      valid: false, 
      error: `Total file size (${totalSizeMB.toFixed(1)}MB) exceeds ${maxTotalSizeMB}MB limit`,
      totalSizeMB 
    }
  }
  
  return { valid: true, totalSizeMB }
}

// Get audio duration from file using Web Audio API
export async function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    const url = URL.createObjectURL(file)
    
    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(url)
      resolve(audio.duration)
    })
    
    audio.addEventListener('error', (e) => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load audio metadata'))
    })
    
    audio.src = url
  })
}

// Validate audio duration for voice cloning
export function validateAudioDuration(duration: number, minSeconds: number = 3, maxSeconds: number = 300): { 
  valid: boolean
  warning?: string
  recommendation?: string
} {
  if (duration < minSeconds) {
    return {
      valid: false,
      warning: `Audio is very short (${duration.toFixed(1)}s)`,
      recommendation: `Use at least ${minSeconds} seconds of clear speech for best results`
    }
  }
  
  if (duration < 10) {
    return {
      valid: true,
      warning: `Audio is short (${duration.toFixed(1)}s)`,
      recommendation: 'Longer samples (30+ seconds) produce better clones'
    }
  }
  
  if (duration > maxSeconds) {
    return {
      valid: true,
      warning: `Audio is very long (${(duration / 60).toFixed(1)} minutes)`,
      recommendation: 'Use 30-60 seconds of your best quality speech'
    }
  }
  
  return { valid: true }
}

// Validate total duration for multiple files
export function validateTotalDuration(totalDuration: number, minTotalSeconds: number = 3, recommendedTotalSeconds: number = 30): {
  valid: boolean
  warning?: string
  recommendation?: string
} {
  if (totalDuration < minTotalSeconds) {
    return {
      valid: false,
      warning: `Total duration is very short (${totalDuration.toFixed(1)}s)`,
      recommendation: `Use at least ${minTotalSeconds} seconds total for best results`
    }
  }
  
  if (totalDuration < recommendedTotalSeconds) {
    return {
      valid: true,
      warning: `Total duration is short (${totalDuration.toFixed(1)}s)`,
      recommendation: `Aim for ${recommendedTotalSeconds}+ seconds total for optimal quality`
    }
  }
  
  return { valid: true }
}

// Sanitize text input
export function sanitizeText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
}

// Validate and sanitize TTS request
export function validateTTSRequest(body: unknown): {
  success: boolean
  data?: z.infer<typeof ttsRequestSchema>
  error?: string
} {
  try {
    const parsed = ttsRequestSchema.parse(body)
    // Additional sanitization
    parsed.text = sanitizeText(parsed.text)
    return { success: true, data: parsed }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      }
    }
    return { success: false, error: 'Invalid request format' }
  }
}

// IP address validation and extraction
export function extractClientIP(request: Request | { headers: Headers | { get: (name: string) => string | null } }): string {
  const getHeader = (name: string) => {
    if ('headers' in request && request.headers instanceof Headers) {
      return request.headers.get(name)
    }
    if ('get' in request && typeof (request as { get: (n: string) => string | null }).get === 'function') {
      return (request as { get: (n: string) => string | null }).get(name)
    }
    return null
  }
  
  const forwarded = getHeader('x-forwarded-for')
  const realIP = getHeader('x-real-ip')
  const cfConnectingIP = getHeader('cf-connecting-ip') // Cloudflare
  
  // Priority: Cloudflare > X-Real-IP > X-Forwarded-For > default
  const ip = cfConnectingIP || realIP || forwarded?.split(',')[0]?.trim() || '127.0.0.1'
  
  // Basic IP validation
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/
  
  if (ipv4Regex.test(ip) || ipv6Regex.test(ip)) {
    return ip
  }
  
  return '127.0.0.1' // Fallback to localhost
}
