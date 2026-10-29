/**
 * Canonical API request/response contracts for solo-creator rebuild.
 * Single source of truth for TTS, voices, clone, and health endpoints.
 * March 2026
 */

// --- Voices ---
export interface ApiVoice {
  voice_id: string
  name: string
  language?: string
  gender?: string
  source: string
  category: string
  description?: string
}

export interface VoicesResponse {
  voices: ApiVoice[]
  default_count: number
  cloned_count: number
  /** True when the cloned list could not be fetched (voice service unreachable); stock voice list is still returned */
  degraded?: boolean
  /** Present when degraded; reason for partial response */
  degraded_reason?: string
}

// --- TTS ---
export interface TTSRequestBody {
  text: string
  voice_id: string
  language?: string
  speed?: number
  pitch?: number
  volume?: number
  reverb?: number
  echo?: number
  noise_reduction?: boolean
  special_effect?: string
  user_id?: string
}

// Success: binary audio (WAV/MP3). Error: JSON with error, details?, requestId?
export interface TTSErrorResponse {
  error: string
  details?: string
  requestId?: string
  hint?: string
}

// --- Clone ---
export interface CloneSuccessResponse {
  success: true
  voice_id: string
  message?: string
  rateLimit?: { limit: number; remaining: number; reset: string }
}

export interface CloneErrorResponse {
  error: string
  hint?: string
}

// --- Health ---
export interface HealthResponse {
  status: 'ok' | 'degraded'
  timestamp: string
  uptime: number
  services: {
    nextjs: { status: string; version: string }
    xtts: { status: string; url: string; error?: string; latency?: number; [k: string]: unknown }
    ttsV2?: { status: string; url: string; latency?: number }
    rag?: { status: string; url: string; latency?: number }
  }
  environment: { NODE_ENV?: string; isRailway: boolean; environment: string }
  capabilities: { tts_default: boolean; cloning: boolean; tts_v2: boolean; rag: boolean }
  latency: number
}
