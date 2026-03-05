/**
 * In-memory TTS response cache for repeat lines (solo-creator workflow).
 * Cache key = hash of text + voice_id + params. Max 200 entries, LRU eviction.
 * March 2026
 */

const MAX_ENTRIES = 200

interface CacheEntry {
  buffer: ArrayBuffer
  contentType: string
  createdAt: number
}

const cache = new Map<string, CacheEntry>()
const keyOrder: string[] = []

function hash(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h = ((h << 5) - h) + c
    h = h & h
  }
  return String(h)
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
}): string {
  const payload = [
    params.text.trim(),
    params.voice_id,
    params.language,
    params.speed,
    params.pitch,
    params.volume,
    params.reverb,
    params.echo,
    params.noise_reduction ? '1' : '0',
    params.special_effect,
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
  while (cache.size >= MAX_ENTRIES && keyOrder.length > 0) {
    const oldest = keyOrder.shift()!
    cache.delete(oldest)
  }
  cache.set(key, { buffer, contentType, createdAt: Date.now() })
  keyOrder.push(key)
}
