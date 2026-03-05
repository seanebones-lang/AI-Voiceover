/**
 * Microsoft Edge TTS Service
 * Uses Microsoft's Edge Read Aloud WebSocket API — free, no API key required.
 * Voices match the en-US-GuyNeural, en-GB-SoniaNeural, etc. family.
 */
import WebSocket from 'ws'
import { randomUUID } from 'crypto'

// Map internal voice IDs → Microsoft Neural voice names
export const EDGE_VOICE_MAP: Record<string, string> = {
  default_english: 'en-US-GuyNeural',
  male_us_aria: 'en-US-DavisNeural',
  male_us_davis: 'en-US-DavisNeural',
  female_english: 'en-US-JennyNeural',
  female_us_aria: 'en-US-AriaNeural',
  female_us_amber: 'en-US-AmberNeural',
  male_british: 'en-GB-RyanNeural',
  male_british_libby: 'en-GB-RyanNeural',
  female_british: 'en-GB-SoniaNeural',
  female_british_libby: 'en-GB-LibbyNeural',
  default_spanish: 'es-ES-AlvaroNeural',
  spanish_female: 'es-ES-ElviraNeural',
  default_french: 'fr-FR-HenriNeural',
  french_female: 'fr-FR-DeniseNeural',
  default_german: 'de-DE-ConradNeural',
  german_female: 'de-DE-KatjaNeural',
  default_portuguese: 'pt-BR-AntonioNeural',
  portuguese_female: 'pt-BR-FranciscaNeural',
  italian_male: 'it-IT-DiegoNeural',
  italian_female: 'it-IT-ElsaNeural',
  japanese_male: 'ja-JP-KeitaNeural',
  japanese_female: 'ja-JP-NanamiNeural',
  chinese_male: 'zh-CN-YunyangNeural',
  chinese_female: 'zh-CN-XiaoxiaoNeural',
  korean_male: 'ko-KR-InJoonNeural',
  korean_female: 'ko-KR-SunHiNeural',
}

export function isEdgeVoice(voiceId: string): boolean {
  return voiceId in EDGE_VOICE_MAP
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function isoDate(): string {
  return new Date().toISOString()
}

/**
 * Synthesize speech using Microsoft Edge TTS.
 * Returns an MP3 buffer.
 */
export function synthesizeEdge(params: {
  text: string
  voiceId: string
  speed?: number // 0.5–2.0, default 1.0
  pitch?: number // -20 to +20 semitones, default 0
}): Promise<Buffer> {
  const { text, voiceId, speed = 1.0, pitch = 0 } = params

  const voiceName = EDGE_VOICE_MAP[voiceId]
  if (!voiceName) return Promise.reject(new Error(`Unknown Edge TTS voice: ${voiceId}`))
  if (!text?.trim()) return Promise.reject(new Error('text is required'))

  // Convert speed to rate percentage: 1.0 → +0%, 1.5 → +50%, 0.5 → -50%
  const ratePercent = Math.round((speed - 1) * 100)
  const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`

  // Convert semitone pitch to Hz: roughly 12 semitones ≈ 50 Hz change
  const pitchHz = Math.round(pitch * 4)
  const pitchStr = pitchHz >= 0 ? `+${pitchHz}Hz` : `${pitchHz}Hz`

  const connectionId = randomUUID().replace(/-/g, '')
  const requestId = randomUUID().replace(/-/g, '')

  const WS_URL =
    `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
    `?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connectionId}`

  return new Promise((resolve, reject) => {
    const audioChunks: Buffer[] = []
    let finished = false

    const timeout = setTimeout(() => {
      try { ws.close() } catch { /* ignore */ }
      reject(new Error('Edge TTS timeout after 30s'))
    }, 30000)

    const ws = new WebSocket(WS_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      },
    })

    ws.on('error', (err: Error) => {
      clearTimeout(timeout)
      reject(err)
    })

    ws.on('close', () => {
      clearTimeout(timeout)
      if (audioChunks.length > 0) {
        resolve(Buffer.concat(audioChunks))
      } else if (!finished) {
        reject(new Error('Edge TTS closed without audio'))
      }
    })

    ws.on('open', () => {
      // 1. Send speech config
      const configMsg = [
        `X-Timestamp:${isoDate()}`,
        'Content-Type:application/json; charset=utf-8',
        'Path:speech.config',
        '',
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: 'false',
                  wordBoundaryEnabled: 'false',
                },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
              },
            },
          },
        }),
      ].join('\r\n')

      ws.send(configMsg)

      // 2. Send SSML synthesis request
      const ssml = [
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>`,
        `  <voice name='${voiceName}'>`,
        `    <prosody rate='${rateStr}' pitch='${pitchStr}'>`,
        `      ${escapeXml(text.trim())}`,
        `    </prosody>`,
        `  </voice>`,
        `</speak>`,
      ].join('')

      const ssmlMsg = [
        `X-RequestId:${requestId}`,
        'Content-Type:application/ssml+xml',
        `X-Timestamp:${isoDate()}`,
        'Path:ssml',
        '',
        ssml,
      ].join('\r\n')

      ws.send(ssmlMsg)
    })

    ws.on('message', (data: Buffer | string) => {
      if (typeof data === 'string') {
        // Text message — check for turn.end
        if (data.includes('Path:turn.end')) {
          finished = true
          clearTimeout(timeout)
          ws.close()
        }
      } else {
        // Binary message — extract audio after the header separator
        const headerEnd = data.indexOf('\r\n\r\n')
        if (headerEnd !== -1) {
          const header = data.slice(0, headerEnd).toString()
          if (header.includes('Path:audio')) {
            const audioData = data.slice(headerEnd + 4)
            if (audioData.length > 0) {
              audioChunks.push(audioData)
            }
          }
        }
      }
    })
  })
}
