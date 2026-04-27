/**
 * Type definitions for Voice-related entities
 * Centralized type definitions to ensure consistency
 */

export interface Voice {
  voice_id: string
  name: string
  language: string
  source: 'system' | 'cloned' | 'custom'
  description?: string
}

export interface VoiceResponse {
  voices: Voice[]
  total?: number
}

export function isVoiceResponse(data: unknown): data is VoiceResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'voices' in data &&
    Array.isArray((data as any).voices)
  )
}

export function isVoice(data: unknown): data is Voice {
  return (
    typeof data === 'object' &&
    data !== null &&
    'voice_id' in data &&
    'name' in data &&
    'language' in data &&
    'source' in data &&
    typeof (data as any).voice_id === 'string' &&
    typeof (data as any).name === 'string' &&
    typeof (data as any).language === 'string' &&
    typeof (data as any).source === 'string'
  )
}
