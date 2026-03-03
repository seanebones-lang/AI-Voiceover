import { describe, it, expect } from '@jest/globals';
import { synthesizeTTS } from '../lib/tts_v2/xtts';

jest.mock('coqui-tts');

describe('Emotions & Style', () => {
  it('applies happy prefix', async () => {
    const audio = await synthesizeTTS('test', Buffer.from('sample'), { emotion: 'happy' });
    expect(audio).toBeDefined();  // Mock synth
  });

  it('adjusts speed/pitch', async () => {
    const audio = await synthesizeTTS('test', Buffer.from('sample'), { speed: 1.5, pitch: 1.1 });
    expect(audio.length).toBeGreaterThan(0);
  });
});