'use client'

/**
 * EmotionPicker Component
 * Allows users to select an emotion for TTS generation
 * 
 * @param selectedEmotion - Currently selected emotion ID
 * @param onEmotionChange - Callback when emotion selection changes
 */
import React, { useMemo } from 'react'
import { EMOTIONS, type EmotionId } from '@/lib/constants/emotions'

interface EmotionPickerProps {
  selectedEmotion: EmotionId
  onEmotionChange: (emotion: EmotionId) => void
  'aria-label'?: string
}

export const EmotionPicker = React.memo(function EmotionPicker({
  selectedEmotion,
  onEmotionChange,
  'aria-label': ariaLabel = 'Select emotion for voice generation',
}: EmotionPickerProps) {
  const emotionButtons = useMemo(() => {
    return EMOTIONS.map((emotion) => {
      const Icon = emotion.icon
      const isSelected = selectedEmotion === emotion.id
      
      return (
        <button
          key={emotion.id}
          onClick={() => onEmotionChange(emotion.id)}
          aria-label={`Select ${emotion.label} emotion`}
          aria-pressed={isSelected}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onEmotionChange(emotion.id)
            }
          }}
          className={`
            flex flex-col items-center gap-1 p-3 rounded-lg border transition-all
            ${isSelected 
              ? `${emotion.color} border-transparent text-white shadow-lg scale-105` 
              : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50'
            }
          `}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
          <span className="text-xs">{emotion.label}</span>
        </button>
      )
    })
  }, [selectedEmotion, onEmotionChange])

  return (
    <div role="group" aria-label={ariaLabel}>
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        {emotionButtons}
      </div>
    </div>
  )
})
