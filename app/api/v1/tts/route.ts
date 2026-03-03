// Updated existing TTS route

import { synthesizeTTS } from '@/lib/tts_v2/xtts';

// ...
export async function POST(req: NextRequest) {
  const { text, voice, emotion, speed, pitch, temperature, format = 'mp3' } = await req.json();
  const userId = req.headers.get('x-api-user-id');

  const creditsCost = Math.ceil(text.length / 10);
  // deduct...

  const audio = await synthesizeTTS(text, voiceBuffer, {
    emotion: emotion as any,
    speed: Number(speed),
    pitch: Number(pitch),
    temperature: Number(temperature),
  });

  return new NextResponse(await convertToFormat(audio, format), {
    headers: { 'Content-Type': `audio/${format}` },
  });
}