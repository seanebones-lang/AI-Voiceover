/**
 * xAI TTS via Grok Voice Agent API (WebSocket)
 * Current as of March 2026: https://docs.x.ai/developers/model-capabilities/audio/voice-agent
 * Voices: Eve, Ara, Rex, Sal, Leo
 */
import WebSocket from 'ws'

const XAI_REALTIME_URL = 'wss://api.x.ai/v1/realtime'
const SAMPLE_RATE = 24000

export const XAI_VOICES = [
  { voice_id: 'Eve', name: 'Eve', description: 'Energetic, upbeat', gender: 'female', source: 'xai', category: 'xai' },
  { voice_id: 'Ara', name: 'Ara', description: 'Warm, friendly', gender: 'female', source: 'xai', category: 'xai' },
  { voice_id: 'Rex', name: 'Rex', description: 'Confident, clear', gender: 'male', source: 'xai', category: 'xai' },
  { voice_id: 'Sal', name: 'Sal', description: 'Smooth, balanced', gender: 'neutral', source: 'xai', category: 'xai' },
  { voice_id: 'Leo', name: 'Leo', description: 'Authoritative, strong', gender: 'male', source: 'xai', category: 'xai' },
] as const

const VALID_VOICE_IDS = new Set(XAI_VOICES.map((v) => v.voice_id))

export function getXaiVoices() {
  return [...XAI_VOICES]
}

export function isValidXaiVoice(voiceId: string): boolean {
  return VALID_VOICE_IDS.has(voiceId as (typeof XAI_VOICES)[number]['voice_id'])
}

/**
 * Generate speech via xAI Voice Agent WebSocket.
 * Returns PCM16 mono at SAMPLE_RATE; caller can wrap in WAV if needed.
 */
export function synthesizeXai(params: {
  text: string
  voiceId: string
  apiKey: string
}): Promise<Buffer> {
  const { text, voiceId, apiKey } = params
  if (!text?.trim()) return Promise.reject(new Error('text is required'))
  if (!isValidXaiVoice(voiceId)) return Promise.reject(new Error(`Invalid xAI voice: ${voiceId}`))
  if (!apiKey) return Promise.reject(new Error('XAI_API_KEY is required'))

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const timeout = setTimeout(() => {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      reject(new Error('xAI TTS timeout'))
    }, 60000)

    const ws = new WebSocket(XAI_REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    ws.on('error', (err: Error) => {
      clearTimeout(timeout)
      reject(err)
    })

    ws.on('close', () => {
      clearTimeout(timeout)
      if (chunks.length > 0) {
        resolve(Buffer.concat(chunks))
      } else {
        reject(new Error('xAI returned no audio — check voice and API key'))
      }
    })

    let finished = false
    ws.on('open', () => {
      // Configure session: strong TTS-only instructions force verbatim reading
      ws.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            voice: voiceId,
            instructions:
              'You are a text-to-speech engine. Read aloud exactly and only the text the user sends, verbatim, word for word. Do not paraphrase, summarize, greet, respond conversationally, or add anything. Speak only the exact words provided.',
            turn_detection: null,
            modalities: ['audio'],
          },
        })
      )
      // Send text as user input — model will speak it per the TTS instructions above
      ws.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: text.trim() }],
          },
        })
      )
      // Request audio-only response
      ws.send(
        JSON.stringify({
          type: 'response.create',
          response: {
            modalities: ['audio'],
            instructions: 'Read the text exactly as provided. Do not add anything.',
          },
        })
      )
    })

    ws.on('message', (data: Buffer | string) => {
      try {
        const event = JSON.parse(data.toString())
        if (event.type === 'response.output_audio.delta' && event.delta) {
          chunks.push(Buffer.from(event.delta, 'base64'))
        } else if (event.type === 'response.output_audio.done' || event.type === 'response.done') {
          finished = true
          clearTimeout(timeout)
          ws.close()
        } else if (event.type === 'error') {
          clearTimeout(timeout)
          ws.close()
          reject(new Error(event.message || 'xAI API error'))
        }
      } catch {
        // ignore
      }
    })
  })
}

export function pcmToWav(pcm: Buffer, sampleRate: number = SAMPLE_RATE): Buffer {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const dataSize = pcm.length
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(numChannels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)
  return Buffer.concat([header, pcm])
}
