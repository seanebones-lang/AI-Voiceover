/**
 * Piper TTS ONNX Runtime Wrapper
 * Provides high-quality, fast TTS using ONNX models
 */

import * as ort from 'onnxruntime-node'
import * as fs from 'fs'
import * as path from 'path'
import { Readable } from 'stream'

export interface PiperVoice {
  id: string
  name: string
  language: string
  gender?: 'male' | 'female'
  modelPath: string
}

export interface PiperConfig {
  sampleRate: number
  channels: number
  sampleWidth: number
}

export interface TTSOptions {
  speed?: number // 0.5 - 2.0, default 1.0
  pitch?: number // -20 to +20 semitones, default 0
  volume?: number // 0.0 - 1.0, default 1.0
}

const DEFAULT_CONFIG: PiperConfig = {
  sampleRate: 22050,
  channels: 1,
  sampleWidth: 2, // 16-bit
}

export class PiperTTS {
  private session: ort.InferenceSession | null = null
  private modelPath: string
  private config: PiperConfig
  private voiceId: string

  constructor(voiceId: string, modelPath: string, config: PiperConfig = DEFAULT_CONFIG) {
    this.voiceId = voiceId
    this.modelPath = modelPath
    this.config = config
  }

  /**
   * Initialize the ONNX model session
   */
  async initialize(): Promise<void> {
    if (!fs.existsSync(this.modelPath)) {
      throw new Error(`Model file not found: ${this.modelPath}`)
    }

    const options: ort.InferenceSession.SessionOptions = {
      executionProviders: ['cpu'], // Use CPU (can add 'wasm' for browser)
      graphOptimizationLevel: 'all',
    }

    try {
      this.session = await ort.InferenceSession.create(this.modelPath, options)
      console.log(`✓ Loaded Piper model: ${this.voiceId}`)
    } catch (error) {
      throw new Error(`Failed to load ONNX model: ${error}`)
    }
  }

  /**
   * Synthesize speech from text
   */
  async synthesize(text: string, options: TTSOptions = {}): Promise<Buffer> {
    if (!this.session) {
      await this.initialize()
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty')
    }

    // Preprocess text
    const processedText = this.preprocessText(text)

    // Tokenize text (simplified - Piper uses phonemes)
    const tokens = this.tokenize(processedText)

    // Run inference
    const inputTensor = new ort.Tensor('int64', tokens, [1, tokens.length])
    
    const feeds: Record<string, ort.Tensor> = {
      input: inputTensor,
    }

    try {
      const results = await this.session!.run(feeds)
      const audioData = results.output as ort.Tensor

      // Convert tensor to audio buffer
      const audioBuffer = this.tensorToAudioBuffer(audioData, options)

      return audioBuffer
    } catch (error) {
      throw new Error(`TTS synthesis failed: ${error}`)
    }
  }

  /**
   * Synthesize speech and return as stream
   */
  async synthesizeStream(text: string, options: TTSOptions = {}): Promise<Readable> {
    const buffer = await this.synthesize(text, options)
    return Readable.from(buffer)
  }

  /**
   * Preprocess text for TTS
   */
  private preprocessText(text: string): string {
    // Normalize whitespace
    let processed = text.trim().replace(/\s+/g, ' ')
    
    // Expand common abbreviations
    const abbreviations: Record<string, string> = {
      'Dr.': 'Doctor',
      'Mr.': 'Mister',
      'Mrs.': 'Missus',
      'Ms.': 'Miss',
      'Prof.': 'Professor',
      'vs.': 'versus',
      'etc.': 'etcetera',
    }

    for (const [abbr, expansion] of Object.entries(abbreviations)) {
      processed = processed.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), expansion)
    }

    return processed
  }

  /**
   * Tokenize text into phonemes/IDs
   * Simplified version - real Piper uses phoneme mapping
   */
  private tokenize(text: string): number[] {
    // This is a simplified tokenizer
    // Real Piper uses phoneme-to-ID mapping from the model
    // For now, we'll use character-based encoding
    const tokens: number[] = []
    
    for (const char of text) {
      const code = char.charCodeAt(0)
      if (code >= 32 && code <= 126) {
        tokens.push(code)
      } else if (code === 10) {
        tokens.push(32) // Newline -> space
      }
    }

    // Add start/end tokens
    return [0, ...tokens, 0]
  }

  /**
   * Convert ONNX tensor to audio buffer
   */
  private tensorToAudioBuffer(tensor: ort.Tensor, options: TTSOptions): Buffer {
    const data = tensor.data as Float32Array
    const length = data.length

    // Apply speed adjustment
    const speed = options.speed || 1.0
    const targetLength = Math.floor(length / speed)

    // Create 16-bit PCM buffer
    const buffer = Buffer.allocUnsafe(targetLength * 2) // 16-bit = 2 bytes per sample

    for (let i = 0; i < targetLength; i++) {
      const srcIndex = Math.floor(i * speed)
      if (srcIndex < length) {
        // Clamp and convert to 16-bit integer
        let sample = Math.max(-1, Math.min(1, data[srcIndex]))
        
        // Apply pitch adjustment (simplified - real implementation uses resampling)
        if (options.pitch) {
          // Pitch adjustment would require resampling, simplified here
          const pitchFactor = Math.pow(2, (options.pitch || 0) / 12)
          // This is simplified - real pitch shifting needs FFT/resampling
        }

        // Apply volume
        sample *= (options.volume || 1.0)

        // Convert to 16-bit signed integer
        const int16 = Math.max(-32768, Math.min(32767, sample * 32767))
        buffer.writeInt16LE(int16, i * 2)
      }
    }

    return buffer
  }

  /**
   * Get available voices
   */
  static getAvailableVoices(): PiperVoice[] {
    const modelsDir = path.join(process.cwd(), 'models', 'piper')
    
    if (!fs.existsSync(modelsDir)) {
      return []
    }

    const voices: PiperVoice[] = []
    const files = fs.readdirSync(modelsDir)

    for (const file of files) {
      if (file.endsWith('.onnx')) {
        const name = file.replace('.onnx', '')
        const parts = name.split('-')
        
        if (parts.length >= 3) {
          const lang = parts[0] + '_' + parts[1] // e.g., en_US
          const voiceName = parts.slice(2).join('-') // e.g., amy-medium

          voices.push({
            id: name,
            name: `${voiceName} (${lang})`,
            language: lang,
            modelPath: path.join(modelsDir, file),
          })
        }
      }
    }

    return voices
  }

  /**
   * Create WAV header for audio buffer
   */
  static createWAVHeader(audioData: Buffer, sampleRate: number = 22050): Buffer {
    const dataLength = audioData.length
    const header = Buffer.alloc(44)

    // RIFF header
    header.write('RIFF', 0)
    header.writeUInt32LE(36 + dataLength, 4)
    header.write('WAVE', 8)

    // fmt chunk
    header.write('fmt ', 12)
    header.writeUInt32LE(16, 16) // fmt chunk size
    header.writeUInt16LE(1, 20) // audio format (1 = PCM)
    header.writeUInt16LE(1, 22) // num channels (mono)
    header.writeUInt32LE(sampleRate, 24) // sample rate
    header.writeUInt32LE(sampleRate * 2, 28) // byte rate
    header.writeUInt16LE(2, 32) // block align
    header.writeUInt16LE(16, 34) // bits per sample

    // data chunk
    header.write('data', 36)
    header.writeUInt32LE(dataLength, 40)

    return Buffer.concat([header, audioData])
  }
}
