// Upgraded w/ aiVoicePipeline
import { processVoice } from '@/lib/aiVoicePipeline';

export async function cloneVoiceAdvanced(audio: Buffer, prompt?: string): Promise<Buffer> {
  return (await processVoice(audio, prompt)).audio;
}

// Backwards compat...
export async function getVoices() { /* SWR cached */ }