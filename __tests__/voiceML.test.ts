import { processVoice } from '@/lib/aiVoicePipeline'

test('processVoice rejects when pipeline is not configured', async () => {
  const mockAudio = Buffer.from('mock')
  await expect(processVoice(mockAudio)).rejects.toThrow(/not configured/)
})