"use client"

/**
 * VoiceSelect Component
 * Dropdown selector for choosing a TTS voice
 * 
 * @param voices - Array of available voices
 * @param value - Currently selected voice ID
 * @param onChange - Callback when voice selection changes
 */
import React, { useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface Voice {
  voice_id: string
  name: string
  language: string
  source: string
  description?: string
}

interface VoiceSelectProps {
  voices: Voice[]
  value: string
  onChange: (value: string) => void
  'aria-label'?: string
}

export const VoiceSelect = React.memo(function VoiceSelect({ 
  voices, 
  value, 
  onChange,
  'aria-label': ariaLabel = 'Select a voice'
}: VoiceSelectProps) {
  const sortedVoices = useMemo(() => {
    return [...voices].sort((a, b) => {
      // Sort cloned voices first, then by name
      if (a.source === 'cloned' && b.source !== 'cloned') return -1
      if (a.source !== 'cloned' && b.source === 'cloned') return 1
      return a.name.localeCompare(b.name)
    })
  }, [voices])

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel}>
        <SelectValue placeholder="Select a voice..." />
      </SelectTrigger>
      <SelectContent>
        {sortedVoices.map((voice) => (
          <SelectItem 
            key={voice.voice_id} 
            value={voice.voice_id}
            aria-label={`${voice.name} voice in ${voice.language}`}
          >
            {voice.name} ({voice.language})
            {voice.source === 'cloned' && ' 🎭'}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
})
