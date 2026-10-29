/**
 * In-memory TTS response cache for repeat lines (solo-creator workflow).
 * Cache key = hash of text + voice_id + params. Max 200 entries, LRU eviction.
 * March 2026
 */

import { createHash } from 'node:crypto'

const MAX_ENTRIES = 200
/** Byte budget for cached audio (WAV is ~48 KB per second of speech). */
const MAX_BYTES = Math.max(16, Number(process.env.TTS_CACHE_MAX_MB) || 256) * 1024 * 1024
/** Don't let one long render evict everything else. */
const MAX_ENTRY_BYTES = MAX_BYTES / 8

interface CacheEntry {
  buffer: ArrayBuffer
  contentType: string
  createdAt: number
}

const cache = new Map<string, CacheEntry>()
const keyOrder: string[] = []
let totalBytes = 0
/** Bumped when a voice's references change so its old renders are never served again. */
const voiceRevisions = new Map<string, number>()

export function invalidateVoice(voiceId: string): void {
  voiceRevisions.set(voiceId, (voiceRevisions.get(voiceId) ?? 0) + 1)
}

function hash(payload: string): string {
  // Collision-resistant hash so distinct requests do not share audio.
  return createHash('sha256').update(payload).digest('hex')
}

export function buildTtsCacheKey(params: {
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
  /** Clone tuning segment so preset / sampling changes bust cache correctly. */
  clone_tune?: string
  /** Emotion preset (server merges into prosody; included for cache correctness). */
  emotion?: string
}): string {
  const payload = [
    params.text.trim(),
    `${params.voice_id}#${voiceRevisions.get(params.voice_id) ?? 0}`,
    params.language,
    params.speed,
    params.pitch,
    params.volume,
    params.reverb,
    params.echo,
    params.noise_reduction ? '1' : '0',
    params.special_effect,
    params.clone_tune ?? '',
    params.emotion ?? 'neutral',
  ].join('\0')
  return hash(payload)
}

export function getCached(key: string): { buffer: ArrayBuffer; contentType: string } | null {
  const entry = cache.get(key)
  if (!entry) return null
  // Move to end (most recently used)
  const idx = keyOrder.indexOf(key)
  if (idx !== -1) {
    keyOrder.splice(idx, 1)
    keyOrder.push(key)
  }
  return { buffer: entry.buffer, contentType: entry.contentType }
}

export function setCached(key: string, buffer: ArrayBuffer, contentType: string): void {
  if (buffer.byteLength > MAX_ENTRY_BYTES) return
  const existing = cache.get(key)
  if (existing) {
    totalBytes -= existing.buffer.byteLength
    cache.delete(key)
    const idx = keyOrder.indexOf(key)
    if (idx !== -1) keyOrder.splice(idx, 1)
  }
  while ((cache.size >= MAX_ENTRIES || totalBytes + buffer.byteLength > MAX_BYTES) && keyOrder.length > 0) {
    const oldest = keyOrder.shift()!
    totalBytes -= cache.get(oldest)?.buffer.byteLength ?? 0
    cache.delete(oldest)
  }
  cache.set(key, { buffer, contentType, createdAt: Date.now() })
  keyOrder.push(key)
  totalBytes += buffer.byteLength
}

export function cacheStats(): { entries: number; bytes: number; maxBytes: number } {
  return { entries: cache.size, bytes: totalBytes, maxBytes: MAX_BYTES }
}
