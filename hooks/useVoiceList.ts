import useSWR from 'swr';
import { voiceService } from '@/services/voiceService';

const fetcher = (url: string) => voiceService.getVoices();

export const useVoiceList = () => {
  const { data, error, isLoading } = useSWR('/api/voices', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
  return { voices: data ?? [], error, loading: isLoading };
};