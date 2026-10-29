/**
 * Client for the self-hosted voice service (services/xtts). Every voice — stock, studio and
 * cloned — is synthesized there with local models; nothing here calls a third-party API.
 */

import { config, withRetry } from '@/lib/config'
import { isXttsVoice } from '@/lib/tts/stock-voices'

export type OutputFormat = 'wav' | 'mp3'

export interface VoiceServiceTtsPayload {
  text: string
  voice_id: string
  language: string
  speed: number
  pitch: number
  volume: number
  reverb: number
  echo: number
  noise_reduction: boolean
  special_effect: string
  mastering_enabled?: boolean
  mastering_profile?: string
  clone_preset?: string
  temperature?: number
  repetition_penalty?: number
  top_k?: number
  top_p?: number
  output_format?: OutputFormat
}

export type VoiceServiceResult =
  | { ok: true; buffer: ArrayBuffer; contentType: string; engine: string | null; chunks: string | null }
  | { ok: false; status: number; detail: string }

/** Keep below the route's maxDuration (300 s) so we can still answer with a useful error. */
const MAX_TIMEOUT_MS = 270_000

export function voiceServiceTimeoutMs(voiceId: string, textLength: number, hasEffects: boolean): number {
  const base = config.services.xtts.timeout
  let timeout: number
  if (isXttsVoice(voiceId)) {
    // XTTS on CPU runs roughly 1-3x real time; budget for the whole script in one attempt.
    timeout = Math.max(base, 150_000) + Math.min(120_000, Math.floor(textLength / 80) * 6_000)
  } else {
    // Kokoro renders many times faster than real time even on CPU.
    timeout = Math.max(base, 20_000) + Math.min(90_000, Math.floor(textLength / 500) * 5_000)
  }
  if (hasEffects) timeout += 10_000
  return Math.min(timeout, MAX_TIMEOUT_MS)
}

export async function synthesizeWithVoiceService(
  payload: VoiceServiceTtsPayload,
  requestId: string,
  opts: { timeoutMs: number }
): Promise<VoiceServiceResult> {
  const service = config.services.xtts
  // Retrying XTTS work can duplicate minutes of synthesis; fast stock voices may retry once.
  const retries = isXttsVoice(payload.voice_id) ? 0 : Math.min(1, service.retries)

  const response = await withRetry(
    async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs)
      try {
        return await fetch(`${service.url}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }
    },
    retries,
    1000,
    2
  )

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { detail?: unknown }
    const detail =
      typeof err.detail === 'string'
        ? err.detail
        : err.detail
          ? JSON.stringify(err.detail)
          : `Voice service returned ${response.status}`
    return { ok: false, status: response.status, detail }
  }

  return {
    ok: true,
    buffer: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') || 'audio/wav',
    engine: response.headers.get('x-engine'),
    chunks: response.headers.get('x-text-chunks'),
  }
}

export function isUnreachableError(message: string): boolean {
  return /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network|connection refused/i.test(message)
}

export function isAbortError(message: string): boolean {
  return /abort|aborted/i.test(message)
}
