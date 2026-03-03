import { pipeline } from '@xenova/transformers';
import { Pinecone } from '@pinecone-database/pinecone';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from './supabase';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY! });

// Lazy ONNX
let whisper: any, clap: any, rvc: any, piper: any;

const loadModels = async () => {
  whisper ??= await pipeline('automatic-speech-recognition', 'Xenova/whisper-large-v3-turbo');
  clap ??= await pipeline('feature-extraction', 'laion/clap-htsat-unfused');
  rvc ??= await pipeline('audio-to-audio', 'RVC-v2-base.onnx');  // Download stub
  piper ??= await pipeline('text-to-speech', 'rhasspy/piper-voices');
};

export async function processVoice(audioBuffer: Buffer, textPrompt?: string) {
  await loadModels();

  // 1. STT
  const transcript = await whisper(audioBuffer.slice(0, 16000 * 30), { language: 'en' });

  // 2. Embed & Search
  const embed = await clap(audioBuffer);
  const index = pc.Index('ai-voiceover');
  const matches = await index.query({ vector: Array.from(embed.data), topK: 3, includeMetadata: true });
  const similarVoices = matches.matches.map((m: any) => m.metadata!.voiceId);

  // 3. LLM Style
  const stylePrompt = `Clone style from voices [${similarVoices}] for: ${textPrompt || transcript.text}. Output SSML.`;
  const { content } = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 200,
    messages: [{ role: 'user', content: stylePrompt }],
  });

  // 4. TTS + Clone
  const styledText = content[0].text;
  const ttsAudio = await piper(styledText);
  const cloned = await rvc(ttsAudio, { target_voice: similarVoices[0] });

  // 5. Store Embed
  await supabase.from('voices').upsert({ embedding: Array.from(embed.data), audio_url: '...' });

  return cloned;
}

export type VoiceProcessResult = { audio: Buffer; transcript: string; similar: string[] };