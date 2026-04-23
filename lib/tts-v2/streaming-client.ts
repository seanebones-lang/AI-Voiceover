/**
 * HumanMirage TTS Streaming Client
 * Real-time audio playback via WebSocket
 */

export interface StreamOptions {
  text: string
  voiceId?: string
  emotion?: 'neutral' | 'happy' | 'sad' | 'angry' | 'excited' | 'calm' | 'whisper' | 'serious'
  language?: string
  onStart?: () => void
  onProgress?: (samples: number, duration: number) => void
  onEnd?: (totalDuration: number) => void
  onError?: (error: Error) => void
}

export interface StreamResult {
  success: boolean
  duration: number
  samples: number
}

export class TTSStreamClient {
  private ws: WebSocket | null = null
  private audioContext: AudioContext | null = null
  private scheduledTime: number = 0
  private sampleRate: number = 24000
  private isPlaying: boolean = false
  private connectionPromise: Promise<void> | null = null

  constructor(
    private wsUrl: string = process.env.NEXT_PUBLIC_TTS_WS_URL || 'ws://localhost:8082/ws/stream'
  ) {}

  /**
   * Connect to TTS WebSocket server
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    if (this.connectionPromise) {
      return this.connectionPromise
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl)
        this.ws.binaryType = 'arraybuffer'

        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'))
          this.ws?.close()
        }, 10000)

        this.ws.onopen = () => {
          clearTimeout(timeout)
          console.log('🔌 TTS WebSocket connected')
          resolve()
        }

        this.ws.onerror = (e) => {
          clearTimeout(timeout)
          console.error('WebSocket error:', e)
          reject(new Error('WebSocket connection failed'))
        }

        this.ws.onclose = () => {
          console.log('🔌 TTS WebSocket disconnected')
          this.connectionPromise = null
        }
      } catch (error) {
        reject(error)
      }
    })

    return this.connectionPromise
  }

  /**
   * Initialize AudioContext (must be called after user interaction)
   */
  private initAudio(): void {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate })
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }
  }

  /**
   * Stream and play TTS audio in real-time
   */
  async stream(options: StreamOptions): Promise<StreamResult> {
    // Ensure connected
    await this.connect()

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to TTS server')
    }

    // Initialize audio
    this.initAudio()
    this.scheduledTime = this.audioContext!.currentTime
    this.isPlaying = true

    let totalSamples = 0
    let firstChunk = true

    return new Promise((resolve, reject) => {
      const handleMessage = async (event: MessageEvent) => {
        try {
          if (event.data instanceof ArrayBuffer) {
            // Binary PCM data
            const int16Array = new Int16Array(event.data)
            const float32Array = new Float32Array(int16Array.length)

            // Convert int16 to float32 [-1, 1]
            for (let i = 0; i < int16Array.length; i++) {
              float32Array[i] = int16Array[i] / 32768
            }

            // Create audio buffer
            const buffer = this.audioContext!.createBuffer(
              1,
              float32Array.length,
              this.sampleRate
            )
            buffer.getChannelData(0).set(float32Array)

            // Schedule playback
            const source = this.audioContext!.createBufferSource()
            source.buffer = buffer
            source.connect(this.audioContext!.destination)

            const startTime = Math.max(
              this.scheduledTime,
              this.audioContext!.currentTime + 0.01
            )
            source.start(startTime)
            this.scheduledTime = startTime + buffer.duration

            totalSamples += float32Array.length

            if (firstChunk) {
              firstChunk = false
              options.onStart?.()
            }

            options.onProgress?.(totalSamples, totalSamples / this.sampleRate)

          } else {
            // JSON message
            const data = JSON.parse(event.data)

            if (data.done) {
              this.isPlaying = false
              this.ws!.removeEventListener('message', handleMessage)

              // Update sample rate if provided
              if (data.sample_rate) {
                this.sampleRate = data.sample_rate
              }

              const duration = data.duration_ms / 1000
              options.onEnd?.(duration)

              resolve({
                success: true,
                duration,
                samples: data.samples || totalSamples
              })
            }

            if (data.error) {
              this.isPlaying = false
              this.ws!.removeEventListener('message', handleMessage)

              const error = new Error(data.error)
              options.onError?.(error)
              reject(error)
            }
          }
        } catch (error) {
          console.error('Error processing audio chunk:', error)
        }
      }

      this.ws!.addEventListener('message', handleMessage)

      // Send request
      this.ws!.send(JSON.stringify({
        text: options.text,
        voice_id: options.voiceId,
        emotion: options.emotion || 'neutral',
        language: options.language || 'en'
      }))
    })
  }

  /**
   * Stop current playback
   */
  stop(): void {
    this.isPlaying = false

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close()
      this.audioContext = null
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.stop()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.connectionPromise = null
  }

  /**
   * Check if currently streaming
   */
  get streaming(): boolean {
    return this.isPlaying
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// Singleton instance
let _client: TTSStreamClient | null = null

export function getTTSClient(): TTSStreamClient {
  if (!_client) {
    _client = new TTSStreamClient()
  }
  return _client
}

// React Hook
import { useState, useCallback, useRef, useEffect } from 'react'

export function useTTSStream(wsUrl?: string) {
  const clientRef = useRef<TTSStreamClient | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [progress, setProgress] = useState({ samples: 0, duration: 0 })
  const [error, setError] = useState<Error | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    clientRef.current = new TTSStreamClient(wsUrl)

    return () => {
      clientRef.current?.disconnect()
    }
  }, [wsUrl])

  const speak = useCallback(async (
    text: string,
    voiceId?: string,
    emotion?: string,
    language?: string
  ): Promise<StreamResult | null> => {
    if (!clientRef.current) return null

    setIsStreaming(true)
    setProgress({ samples: 0, duration: 0 })
    setError(null)

    try {
      setConnected(clientRef.current.connected)
      const result = await clientRef.current.stream({
        text,
        voiceId,
        emotion: emotion as StreamOptions['emotion'],
        language,
        onStart: () => {
          setConnected(clientRef.current?.connected ?? false)
          console.log('🎵 Audio playback started')
        },
        onProgress: (samples, duration) => {
          setProgress({ samples, duration })
        },
        onEnd: (duration) => {
          console.log(`✅ Playback complete: ${duration.toFixed(2)}s`)
          setIsStreaming(false)
        },
        onError: (err) => {
          setError(err)
          setIsStreaming(false)
          setConnected(clientRef.current?.connected ?? false)
        }
      })

      setConnected(clientRef.current.connected)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      setIsStreaming(false)
      setConnected(clientRef.current?.connected ?? false)
      return null
    }
  }, [])

  const stop = useCallback(() => {
    clientRef.current?.stop()
    setIsStreaming(false)
    setConnected(clientRef.current?.connected ?? false)
  }, [])

  return {
    speak,
    stop,
    isStreaming,
    progress,
    error,
    connected
  }
}
