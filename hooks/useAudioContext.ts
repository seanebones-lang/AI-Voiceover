/**
 * Custom hook for managing AudioContext
 * Ensures proper cleanup and prevents memory leaks
 */
import { useRef, useEffect } from 'react'

export function useAudioContext() {
  const audioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    // Create AudioContext on mount
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }

    // Cleanup on unmount
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error)
        audioContextRef.current = null
      }
    }
  }, [])

  return audioContextRef
}
