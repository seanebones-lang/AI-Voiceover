/**
 * Edge TTS fallback when XTTS sidecar is unreachable (e.g. Railway single-service).
 * Uses Microsoft Edge TTS so default (standard) voices still work.
 */

import { EdgeTTS } from 'edge-tts-universal'

// Map our voice_id -> Edge Neural voice name (Microsoft format)
const EDGE_VOICE_MAP: Record<string, string> = {
  default_english: 'en-US-GuyNeural',
  male_us_aria: 'en-US-DavisNeural',
  male_us_davis: 'en-US-DavisNeural',
  female_english: 'en-US-JennyNeural',
  female_us_aria: 'en-US-AriaNeural',
  female_us_amber: 'en-US-AmberNeural',
  male_british: 'en-GB-RyanNeural',
  male_british_libby: 'en-GB-LibbyNeural',
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

export function isDefaultVoiceId(voiceId: string): boolean {
  return voiceId in EDGE_VOICE_MAP
}

function getEdgeVoice(voiceId: string): string {
  return EDGE_VOICE_MAP[voiceId] ?? 'en-US-GuyNeural'
}

export interface EdgeTtsOptions {
  speed?: number
  pitch?: number
  volume?: number
}

/**
 * Synthesize speech using Edge TTS. Returns MP3 buffer.
 */
export async function synthesizeEdgeTts(
  text: string,
  voiceId: string,
  options: EdgeTtsOptions = {}
): Promise<Buffer> {
  const edgeVoice = getEdgeVoice(voiceId)
  const { speed = 1, pitch = 0, volume = 1 } = options
  const ratePercent = Math.round((speed - 1) * 100)
  const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`
  const pitchHz = Math.round(pitch * 10)
  const pitchStr = pitchHz >= 0 ? `+${pitchHz}Hz` : `${pitchHz}Hz`

  const tts = new EdgeTTS(text, edgeVoice, {
    rate: rateStr,
    pitch: pitchStr,
    volume: volume !== 1 ? `${volume * 100}%` : undefined,
  })
  const result = await tts.synthesize()
  const arrayBuffer = await result.audio.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
