/** Client-side voice list: fetches /api/voices. */
export const voiceService = {
  async getVoices(): Promise<{ voices: unknown[] }> {
    const res = await fetch('/api/voices', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch voices');
    return res.json();
  },
};
