'use client'

/**
 * VoiceSettings Component
 * Controls for adjusting voice speed and volume
 * 
 * @param speed - Current speed value (0.5-2.0)
 * @param volume - Current volume value (0-1)
 * @param onSpeedChange - Callback when speed changes
 * @param onVolumeChange - Callback when volume changes
 */
import React from 'react'
import { Slider } from '@/components/ui/slider'

interface VoiceSettingsProps {
  speed: number[]
  volume: number[]
  onSpeedChange: (value: number[]) => void
  onVolumeChange: (value: number[]) => void
}

export const VoiceSettings = React.memo(function VoiceSettings({
  speed,
  volume,
  onSpeedChange,
  onVolumeChange,
}: VoiceSettingsProps) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Speed */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="speed-slider" className="text-sm font-medium text-slate-300">
            Speed
          </label>
          <span className="text-sm text-slate-500 font-mono" aria-live="polite">
            {speed[0].toFixed(2)}x
          </span>
        </div>
        <Slider
          id="speed-slider"
          value={speed}
          onValueChange={onSpeedChange}
          min={0.5}
          max={2.0}
          step={0.1}
          className="[&_[role=slider]]:bg-purple-500"
          aria-label="Voice speed"
          aria-valuemin={0.5}
          aria-valuemax={2.0}
          aria-valuenow={speed[0]}
        />
      </div>

      {/* Volume */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="volume-slider" className="text-sm font-medium text-slate-300">
            Volume
          </label>
          <span className="text-sm text-slate-500 font-mono" aria-live="polite">
            {Math.round(volume[0] * 100)}%
          </span>
        </div>
        <Slider
          id="volume-slider"
          value={volume}
          onValueChange={onVolumeChange}
          min={0}
          max={1}
          step={0.05}
          className="[&_[role=slider]]:bg-cyan-500"
          aria-label="Voice volume"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={volume[0] * 100}
        />
      </div>
    </div>
  )
})
