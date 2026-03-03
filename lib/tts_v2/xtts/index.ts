// Stub: real TTS runs in Python (services/xtts). Use POST /api/tts for generation.

export async function synthesizeTTS(
  _text: string,
  _voice_sample: Buffer,
  _options: {
    emotion?: 'happy' | 'sad' | 'angry' | 'excited' | 'neutral'
    speed?: number
    pitch?: number
    temperature?: number
  } = {}
): Promise<Buffer> {
  throw new Error(
    'TTS synthesis runs on the XTTS service. Use POST /api/tts with voice_id and text instead.'
  )
}