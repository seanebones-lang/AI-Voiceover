import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { supabaseAdmin } from '../lib/db';

jest.mock('@supabase/supabase-js');

describe('Database Operations', () => {
  it('upserts voice with embedding', async () => {
    const voice = await upsertVoice('test', [0.1, 0.2], ['sample.mp3'], 'user123');
    expect(voice.name).toBe('test');
    expect(voice.embedding.length).toBe(512);
  });

  it('searches similar voices', async () => {
    const results = await searchVoices([0.1, 0.2]);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('gets user stats', async () => {
    const stats = await getUserStats('user123');
    expect(stats.projects_count).toBeDefined();
  });
});