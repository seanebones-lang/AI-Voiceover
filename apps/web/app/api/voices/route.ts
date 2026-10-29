import { NextResponse } from 'next/server'
import { config, getServiceUrl, withRetry } from '@/lib/config'
import { STOCK_VOICES } from '@/lib/tts/stock-voices'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

let clonedVoicesUnavailableLogged = false

interface Voice {
  voice_id: string
  name: string
  language?: string
  gender?: string
  source: string
  category: string
  description?: string
  engine?: string
  /** False while the local engine for this voice is still loading / unavailable. */
  available?: boolean
}

interface ServiceVoices {
  cloned: Voice[]
  /** voice_id → available, from the voice service (absent when it could not be reached) */
  stockAvailability?: Map<string, boolean>
  error?: string
}

async function fetchServiceVoices(): Promise<ServiceVoices> {
  if (config.isRailway && !config.xttsConfigured) {
    return { cloned: [], error: 'Voice service not configured (set XTTS_URL)' }
  }
  const timeoutMs = 5000 // Fail fast when the voice service is not running (e.g. local dev)
  try {
    const response = await withRetry(async () => {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), timeoutMs)
      try {
        return await fetch(`${getServiceUrl('xtts')}/voices`, {
          cache: 'no-store',
          signal: controller.signal,
          headers: { 'User-Agent': 'NextEleven-VoiceAPI/1.0' },
        })
      } finally {
        clearTimeout(t)
      }
    }, 2, 1000, 1.5)

    if (!response.ok) return { cloned: [], error: `Voice service returned ${response.status}` }

    const data = (await response.json().catch(() => ({ voices: [] }))) as {
      voices?: Array<{ voice_id?: string; name?: string; description?: string }>
      stock_voices?: Array<{ voice_id?: string; available?: boolean }>
    }
    const cloned = (data.voices || [])
      .filter((v) => typeof v.voice_id === 'string')
      .map((v) => ({
        voice_id: v.voice_id as string,
        name: v.name || (v.voice_id as string),
        language: 'multilingual',
        source: 'cloned',
        category: 'cloned',
        engine: 'xtts',
        description: v.description || 'Custom cloned voice',
      }))
    const stockAvailability = Array.isArray(data.stock_voices)
      ? new Map(
          data.stock_voices
            .filter((v) => typeof v.voice_id === 'string')
            .map((v) => [v.voice_id as string, v.available !== false])
        )
      : undefined
    return { cloned, stockAvailability }
  } catch (error) {
    if (!clonedVoicesUnavailableLogged) {
      clonedVoicesUnavailableLogged = true
      console.log('Voice service not available:', error instanceof Error ? error.message : 'Unknown error')
    }
    return {
      cloned: [],
      error: error instanceof Error ? error.message : 'Voice service unreachable',
    }
  }
}

export async function GET() {
  const { cloned, stockAvailability, error } = await fetchServiceVoices()
  const stock: Voice[] = STOCK_VOICES.map((v) => ({
    voice_id: v.voice_id,
    name: v.name,
    language: v.language,
    gender: v.gender,
    source: 'local',
    category: v.voice_id.startsWith('studio_') ? 'studio' : 'standard',
    description: v.description,
    engine: v.engine,
    available: stockAvailability ? stockAvailability.get(v.voice_id) ?? false : !error,
  }))

  return NextResponse.json({
    voices: [...stock, ...cloned],
    default_count: stock.length,
    cloned_count: cloned.length,
    ...(error ? { degraded: true, degraded_reason: error } : {}),
  })
}
