/**
 * Voice effect configurations
 * Shared across components
 */
export interface VoiceEffect {
  id: string
  label: string
  icon: string
}

export const VOICE_EFFECTS: readonly VoiceEffect[] = [
  { id: 'none', label: 'None', icon: '🎵' },
  { id: 'radio', label: 'Radio', icon: '📻' },
  { id: 'stadium', label: 'Stadium', icon: '🏟️' },
  { id: 'robot', label: 'Robot', icon: '🤖' },
  { id: 'whisper', label: 'Whisper', icon: '🌙' },
  { id: 'warm', label: 'Warm', icon: '☀️' },
  { id: 'bright', label: 'Bright', icon: '✨' },
  { id: 'broadcast', label: 'Broadcast', icon: '🎙️' },
] as const

export type VoiceEffectId = typeof VOICE_EFFECTS[number]['id']

export function getEffectById(id: string): VoiceEffect | undefined {
  return VOICE_EFFECTS.find(e => e.id === id)
}
