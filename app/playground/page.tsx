/* Existing imports + */
import { useVoiceList } from '@/hooks/useVoiceList';
import dynamic from 'next/dynamic';

const VoiceChart = dynamic(() => import('@/components/VoiceChart'), { ssr: false });

const Playground = () => {
  const { voices, loading, error } = useVoiceList();

  if (loading) return <div className='animate-pulse'>Loading voices...</div>;
  if (error) return <button onClick={() => window.location.reload()}>Retry</button>;

  return (
    <div>
      <VoiceChart data={voices} />
      {/* Existing forms w/ aria-labels */}
    </div>
  );
};

export default Playground;