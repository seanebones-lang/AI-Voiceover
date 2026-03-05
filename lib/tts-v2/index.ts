/**
 * HumanMirage TTS Client Library
 * TypeScript client for the TTS v2 service
 */

export * from './streaming-client'

// REST API Client
const TTS_API_URL = process.env.NEXT_PUBLIC_TTS_API_URL || 'http://localhost:8082'

export interface Voice {
  voice_id: string
  name: string
  description?: string
  source: 'cloned' | 'default'
  language?: string
  created_at?: string
}

export interface TTSOptions {
  text: string
  voiceId?: string
  emotion?: string
  language?: string
  speed?: number
}

export interface CloneOptions {
  name: string
  description?: string
  files: File[]
}

/**
 * Check TTS service health
 */
export async function checkHealth(): Promise<{
  status: string
  engine_ready: boolean
}> {
  const response = await fetch(`${TTS_API_URL}/health`)
  return response.json()
}

/**
 * List available voices
 */
export async function listVoices(): Promise<Voice[]> {
  const response = await fetch(`${TTS_API_URL}/voices`)
  const data = await response.json()
  return data.voices || []
}

/**
 * Generate speech (non-streaming)
 */
export async function synthesize(options: TTSOptions): Promise<Blob> {
  const response = await fetch(`${TTS_API_URL}/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: options.text,
      voice_id: options.voiceId,
      emotion: options.emotion || 'neutral',
      language: options.language || 'en',
      speed: options.speed || 1.0,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'TTS failed' }))
    throw new Error(error.detail || 'TTS generation failed')
  }

  return response.blob()
}

/**
 * Clone a voice from audio files
 */
export async function cloneVoice(options: CloneOptions): Promise<{
  success: boolean
  voice_id: string
  name: string
  message: string
}> {
  const formData = new FormData()
  formData.append('name', options.name)
  
  if (options.description) {
    formData.append('description', options.description)
  }
  
  for (const file of options.files) {
    formData.append('files', file)
  }

  const response = await fetch(`${TTS_API_URL}/clone`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Clone failed' }))
    throw new Error(error.detail || 'Voice cloning failed')
  }

  return response.json()
}

/**
 * Delete a cloned voice
 */
export async function deleteVoice(voiceId: string): Promise<void> {
  const response = await fetch(`${TTS_API_URL}/voices/${voiceId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Delete failed' }))
    throw new Error(error.detail || 'Failed to delete voice')
  }
}

/**
 * Play audio blob
 */
export function playAudio(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    
    audio.onended = () => {
      URL.revokeObjectURL(url)
      resolve()
    }
    
    audio.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(new Error('Audio playback failed'))
    }
    
    audio.play().catch(reject)
  })
}

/**
 * Download audio blob as file
 */
export function downloadAudio(blob: Blob, filename?: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `tts-${Date.now()}.wav`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
