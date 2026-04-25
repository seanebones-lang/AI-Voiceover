/**
 * Emotion configurations for TTS
 * Shared across components to ensure consistency
 */
import { 
  MessageSquare, Smile, Frown, Angry, Zap, Heart, Moon, Award 
} from 'lucide-react'

export interface Emotion {
  id: string
  label: string
  icon: typeof MessageSquare
  color: string
  emoji?: string
}

export const EMOTIONS: readonly Emotion[] = [
  { id: 'neutral', label: 'Neutral', icon: MessageSquare, color: 'bg-slate-500', emoji: '😐' },
  { id: 'happy', label: 'Happy', icon: Smile, color: 'bg-yellow-500', emoji: '😊' },
  { id: 'sad', label: 'Sad', icon: Frown, color: 'bg-blue-500', emoji: '😢' },
  { id: 'angry', label: 'Angry', icon: Angry, color: 'bg-red-500', emoji: '😠' },
  { id: 'excited', label: 'Excited', icon: Zap, color: 'bg-orange-500', emoji: '🤩' },
  { id: 'calm', label: 'Calm', icon: Heart, color: 'bg-green-500', emoji: '😌' },
  { id: 'whisper', label: 'Whisper', icon: Moon, color: 'bg-purple-500', emoji: '🤫' },
  { id: 'serious', label: 'Serious', icon: Award, color: 'bg-gray-700', emoji: '🧐' },
] as const

export type EmotionId = typeof EMOTIONS[number]['id']

export function getEmotionById(id: string): Emotion | undefined {
  return EMOTIONS.find(e => e.id === id)
}
