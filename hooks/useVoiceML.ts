import useSWR from 'swr';
import { processVoice } from '@/lib/aiVoicePipeline';

export const useVoiceProcess = (audioFile: File | null) => {
  const { data, error, mutate } = useSWR(audioFile ? `process-${audioFile.name}` : null,
    async () => {
      const buffer = Buffer.from(await audioFile!.arrayBuffer());
      return processVoice(buffer);
    },
    { revalidateOnFocus: false }
  );
  return { processedAudio: data, error, isProcessing: !error && !data };
};