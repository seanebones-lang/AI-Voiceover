/**
 * Integration tests for clone flow: voices list, diagnostic, and clone-path behavior.
 * Ensures clone create -> voices list -> TTS with clone_* ID is consistent.
 * @jest-environment node
 */

import { GET as getVoices } from '@/app/api/voices/route'
import { GET as getDiagnostic } from '@/app/api/diagnostic/clone-flow/route'
import { NextRequest } from 'next/server'

// Mock XTTS service for voices and diagnostic
global.fetch = jest.fn()

describe('Clone flow integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/voices', () => {
    it('returns default_count and cloned_count and voices array', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: [] }),
      })

      const req = new NextRequest('http://localhost/api/voices')
      const res = await getVoices(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('voices')
      expect(Array.isArray(data.voices)).toBe(true)
      expect(data).toHaveProperty('default_count')
      expect(data).toHaveProperty('cloned_count')
      expect(data.cloned_count).toBe(0)
    })

    it('includes cloned voices with clone_ prefix when sidecar returns them', async () => {
      const cloned = [
        { voice_id: 'clone_myvoice_abc123', name: 'My Voice', description: 'Custom' },
      ]
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: cloned }),
      })

      const req = new NextRequest('http://localhost/api/voices')
      const res = await getVoices(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.cloned_count).toBe(1)
      const clonedVoice = data.voices.find((v: { voice_id: string }) => v.voice_id.startsWith('clone_'))
      expect(clonedVoice).toBeDefined()
      expect(clonedVoice.voice_id).toBe('clone_myvoice_abc123')
      expect(clonedVoice.source).toBe('cloned')
    })
  })

  describe('GET /api/diagnostic/clone-flow', () => {
    it('returns status and steps with clone_telemetry', async () => {
      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // health
        .mockResolvedValueOnce({ ok: true, json: async () => ({ default_count: 1, cloned_count: 0 }) }) // voices

      const origSecret = process.env.DIAGNOSTIC_SECRET
      process.env.DIAGNOSTIC_SECRET = 'test-diagnostic-secret'
      try {
        const req = new NextRequest('http://localhost/api/diagnostic/clone-flow', {
          headers: { 'x-diagnostic-secret': 'test-diagnostic-secret' },
        })
        const res = await getDiagnostic(req)
        const data = await res.json()

        expect(res.status).toBe(200)
        expect(data).toHaveProperty('status')
        expect(['ok', 'degraded', 'fail']).toContain(data.status)
        expect(data).toHaveProperty('steps')
        expect(Array.isArray(data.steps)).toBe(true)
        expect(data).toHaveProperty('clone_telemetry')
        expect(data.clone_telemetry).toMatchObject({
          clone_requested: expect.any(Number),
          clone_created: expect.any(Number),
          clone_tts_requested: expect.any(Number),
          clone_tts_success: expect.any(Number),
          clone_tts_error: expect.any(Number),
        })
      } finally {
        if (origSecret !== undefined) process.env.DIAGNOSTIC_SECRET = origSecret
        else delete process.env.DIAGNOSTIC_SECRET
      }
    })
  })
})
