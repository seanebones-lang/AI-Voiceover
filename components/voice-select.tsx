"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Voice {
  voice_id: string
  name: string
  language: string
  source: string
}

interface VoiceSelectProps {
  voices: Voice[]
  value: string
  onChange: (value: string) => void
}

export function VoiceSelect({ voices, value, onChange }: VoiceSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select a voice..." />
      </SelectTrigger>
      <SelectContent>
        {voices.map((voice) => (
          <SelectItem key={voice.voice_id} value={voice.voice_id}>
            {voice.name} ({voice.language})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
