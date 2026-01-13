/**
 * XTTS Sidecar Client
 * Communicates with Python FastAPI service for voice cloning
 */

const XTTS_SIDECAR_URL = process.env.XTTS_SIDECAR_URL || 'http://localhost:8081'

export interface CloneVoiceRequest {
  name: string
  description?: string
  files: File[]
}

export interface CloneVoiceResponse {
  success: boolean
  voice_id: string
  speaker_embedding: string
  name: string
  description?: string
  message: string
}

export interface TTSWithCloneRequest {
  text: string
  speaker_embedding: string
  language?: string
}

export class XTTSClient {
  private baseUrl: string

  constructor(baseUrl: string = XTTS_SIDECAR_URL) {
    this.baseUrl = baseUrl
  }

  /**
   * Check if XTTS service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`)
      const data = await response.json()
      return data.status === 'healthy'
    } catch {
      return false
    }
  }

  /**
   * Clone a voice from reference audio files
   */
  async cloneVoice(request: CloneVoiceRequest): Promise<CloneVoiceResponse> {
    const formData = new FormData()
    formData.append('name', request.name)
    if (request.description) {
      formData.append('description', request.description)
    }

    request.files.forEach((file) => {
      formData.append('files', file)
    })

    const response = await fetch(`${this.baseUrl}/clone`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Voice cloning failed')
    }

    return response.json()
  }

  /**
   * Generate speech using cloned voice
   */
  async generateSpeech(request: TTSWithCloneRequest): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: request.text,
        speaker_embedding: request.speaker_embedding,
        language: request.language || 'en',
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'TTS generation failed')
    }

    return response.blob()
  }
}
