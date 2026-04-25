/**
 * Custom hook for managing voices
 * Provides loading state and voice fetching logic
 */
import { useState, useCallback, useEffect } from 'react'

export interface Voice {
  voice_id: string
  name: string
  language: string
  source: string
  description?: string
}

interface UseVoicesReturn {
  voices: Voice[]
  loading: boolean
  error: string | null
  loadVoices: () => Promise<void>
  refreshVoices: () => Promise<void>
}

export function useVoices(): UseVoicesReturn {
  const [voices, setVoices] = useState<Voice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadVoices = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/voices')
      if (!response.ok) {
        throw new Error('Failed to load voices')
      }
      
      const data = await response.json()
      setVoices(data.voices || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load voices'
      setError(message)
      console.error('Failed to load voices:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshVoices = useCallback(async () => {
    await loadVoices()
  }, [loadVoices])

  // Load voices on mount
  useEffect(() => {
    loadVoices()
  }, [loadVoices])

  return {
    voices,
    loading,
    error,
    loadVoices,
    refreshVoices,
  }
}
