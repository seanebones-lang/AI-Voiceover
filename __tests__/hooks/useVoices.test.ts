import { renderHook, waitFor } from '@testing-library/react'
import { useVoices } from '@/hooks/useVoices'

// Mock fetch
global.fetch = jest.fn()

describe('useVoices', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('loads voices on mount', async () => {
    const mockVoices = [
      { voice_id: 'voice-1', name: 'Voice One', language: 'en', source: 'system' },
    ]
    
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ voices: mockVoices }),
    })

    const { result } = renderHook(() => useVoices())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.voices).toEqual(mockVoices)
    expect(global.fetch).toHaveBeenCalledWith('/api/voices')
  })

  it('handles loading state', () => {
    ;(global.fetch as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    const { result } = renderHook(() => useVoices())

    expect(result.current.loading).toBe(true)
    expect(result.current.voices).toEqual([])
  })

  it('handles errors', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useVoices())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBeTruthy()
    expect(result.current.voices).toEqual([])
  })

  it('allows refreshing voices', async () => {
    const mockVoices = [
      { voice_id: 'voice-1', name: 'Voice One', language: 'en', source: 'system' },
    ]
    
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ voices: mockVoices }),
    })

    const { result } = renderHook(() => useVoices())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Refresh
    await result.current.refreshVoices()

    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
