import useSWR from 'swr';
import { voiceService } from '@/lib/voiceService';

const fetcher = () => voiceService.getVoices();

export const useVoiceList = () => {
  const { data, error, isLoading } = useSWR('/api/voices', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
  return { voices: data?.voices ?? [], error, loading: isLoading };
};