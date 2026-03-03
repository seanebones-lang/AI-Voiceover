import { processVoice } from '@/lib/aiVoicePipeline';

jest.mock('@xenova/transformers');

test('processes voice end-to-end', async () => {
  const mockAudio = Buffer.from('mock');
  const result = await processVoice(mockAudio);
  expect(result.transcript).toBeDefined();
});