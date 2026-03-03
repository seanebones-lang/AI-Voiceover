/**
 * Voice ML pipeline stub — single-user build.
 * Full pipeline (Whisper, Pinecone, Anthropic, RVC, Piper) not configured.
 * Replace with real implementation when those services are enabled.
 */
export type VoiceProcessResult = { audio: Buffer; transcript: string; similar: string[] }

export async function processVoice(
  _audioBuffer: Buffer,
  _textPrompt?: string
): Promise<VoiceProcessResult> {
  throw new Error(
    'Voice ML pipeline is not configured. Configure @xenova/transformers, Pinecone, Anthropic, and supabase to enable.'
  )
}
