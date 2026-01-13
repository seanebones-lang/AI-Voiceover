"use client"

import { useRef, useEffect } from 'react'

interface AudioPlayerProps {
  src: string
}

export function AudioPlayer({ src }: AudioPlayerProps) {
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
    >
      Your browser does not support the audio element.
    </audio>
  )
}
