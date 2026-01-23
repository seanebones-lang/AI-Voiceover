"use client"

/**
 * AudioPlayer Component
 * Displays an HTML5 audio player with controls
 * 
 * @param src - URL of the audio file to play
 */
import React, { useRef, useEffect } from 'react'

interface AudioPlayerProps {
  src: string
  'aria-label'?: string
}

export const AudioPlayer = React.memo(function AudioPlayer({ 
  src,
  'aria-label': ariaLabel = 'Audio player'
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (audioRef.current && src) {
      audioRef.current.src = src
    }
  }, [src])

  return (
    <audio
      ref={audioRef}
      controls
      className="w-full"
      preload="metadata"
      aria-label={ariaLabel}
    >
      Your browser does not support the audio element.
    </audio>
  )
})
