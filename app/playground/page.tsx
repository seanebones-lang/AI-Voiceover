'use client'

import { useVoiceList } from '@/hooks/useVoiceList'
import { useState, useRef } from 'react'

export default function Playground() {
  const { voices, loading, error } = useVoiceList()
  const [text, setText] = useState('')
  const [selectedVoiceId, setSelectedVoiceId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [playError, setPlayError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handleGenerate = async () => {
    if (!text.trim() || !selectedVoiceId) return
    setGenerating(true)
    setPlayError(null)
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), voice_id: selectedVoiceId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.details || j.error || res.statusText)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (audioRef.current) {
        audioRef.current.src = url
        audioRef.current.play().catch((e) => setPlayError(String(e)))
      } else {
        const a = new Audio(url)
        a.play().catch((e) => setPlayError(String(e)))
      }
    } catch (e) {
      setPlayError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <div className="p-4 animate-pulse">Loading voices...</div>
  if (error) return <button className="p-4" onClick={() => window.location.reload()}>Retry</button>

  return (
    <div className="p-4 max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">TTS Playground</h1>
      <div>
        <label className="block text-sm font-medium mb-1">Voice</label>
        <select
          className="w-full border rounded p-2"
          value={selectedVoiceId}
          onChange={(e) => setSelectedVoiceId(e.target.value)}
          aria-label="Select voice"
        >
          <option value="">Select a voice</option>
          {((voices || []) as Array<{ voice_id: string; name: string; source?: string }>).map((v) => (
            <option key={v.voice_id} value={v.voice_id}>
              {v.name} ({v.source ?? 'standard'})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Text</label>
        <textarea
          className="w-full border rounded p-2 min-h-[100px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text to speak..."
          aria-label="Text to speak"
        />
      </div>
      <button
        type="button"
        className="px-4 py-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
        onClick={handleGenerate}
        disabled={generating || !text.trim() || !selectedVoiceId}
      >
        {generating ? 'Generating…' : 'Generate speech'}
      </button>
      {playError && <p className="text-destructive text-sm">{playError}</p>}
      <audio ref={audioRef} className="hidden" controls />
    </div>
  )
}
