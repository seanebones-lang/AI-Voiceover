"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { VoiceSelect } from '@/components/voice-select'
import { WaveformVisualizer } from '@/components/waveform-visualizer'
import { AudioPlayer } from '@/components/audio-player'
import { Wand2, Volume2, Download, Share2 } from 'lucide-react'

interface Voice {
  voice_id: string
  name: string
  language: string
  source: string
}

export function Dashboard() {
  const [text, setText] = useState('')
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [voices, setVoices] = useState<Voice[]>([])
  const [loading, setLoading] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  
  // Voice settings
  const [speed, setSpeed] = useState([1.0])
  const [pitch, setPitch] = useState([0])
  const [volume, setVolume] = useState([1.0])

  useEffect(() => {
    loadVoices()
  }, [])

  async function loadVoices() {
    try {
      const response = await fetch('/api/voices')
      const data = await response.json()
      setVoices(data.voices || [])
      if (data.voices?.length > 0) {
        setSelectedVoice(data.voices[0].voice_id)
      }
    } catch (error) {
      console.error('Failed to load voices:', error)
    }
  }

  async function generateSpeech() {
    if (!text.trim() || !selectedVoice) {
      alert('Please enter text and select a voice')
      return
    }

    setLoading(true)
    setAudioUrl(null)
    setAudioBlob(null)

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text.trim(),
          voice_id: selectedVoice,
          speed: speed[0],
          pitch: pitch[0],
          volume: volume[0],
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Generation failed')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setAudioBlob(blob)
      setAudioUrl(url)
    } catch (error) {
      console.error('Generation error:', error)
      const errorMsg = error instanceof Error ? error.message : 'Failed to generate speech'
      // Show more helpful error message
      if (errorMsg.includes('temporarily unavailable') || errorMsg.includes('fetch failed')) {
        alert('TTS service is starting up. Please wait 10-20 seconds and try again.')
      } else {
        alert(errorMsg)
      }
    } finally {
      setLoading(false)
    }
  }

  function downloadAudio() {
    if (!audioBlob) return

    const url = URL.createObjectURL(audioBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `voiceover-${Date.now()}.wav`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function shareAudio() {
    if (!audioUrl) return

    if (navigator.share) {
      navigator.share({
        title: 'AI Voiceover',
        text: 'Check out this AI voice I generated!',
        url: window.location.href,
      }).catch(() => {})
    } else {
      // Fallback: copy URL
      navigator.clipboard.writeText(window.location.href)
      alert('Link copied to clipboard!')
    }
  }

  const charCount = text.length
  const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
          VoiceClone AI
        </h1>
        <p className="text-muted-foreground">
          Studio-quality text-to-speech powered by Piper TTS
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Text to Speech</CardTitle>
              <CardDescription>
                Enter your text and generate natural-sounding speech
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Voice Selection */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Select Voice
                </label>
                <VoiceSelect
                  voices={voices}
                  value={selectedVoice}
                  onChange={setSelectedVoice}
                />
              </div>

              {/* Text Input */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">
                    Your Text
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {charCount} chars • {wordCount} words
                  </span>
                </div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type or paste your text here..."
                  className="w-full min-h-[200px] px-4 py-3 rounded-lg border bg-background resize-none"
                  maxLength={5000}
                />
              </div>

              {/* Generate Button */}
              <Button
                onClick={generateSpeech}
                disabled={loading || !text.trim() || !selectedVoice}
                className="w-full"
                size="lg"
              >
                <Wand2 className="mr-2 h-4 w-4" />
                {loading ? 'Generating...' : 'Generate Voice-Over'}
              </Button>
            </CardContent>
          </Card>

          {/* Advanced Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Voice Settings</CardTitle>
              <CardDescription>
                Fine-tune the voice characteristics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Speed */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Speed</label>
                  <span className="text-sm text-muted-foreground">
                    {speed[0].toFixed(2)}x
                  </span>
                </div>
                <Slider
                  value={speed}
                  onValueChange={setSpeed}
                  min={0.5}
                  max={2.0}
                  step={0.1}
                />
              </div>

              {/* Pitch */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Pitch</label>
                  <span className="text-sm text-muted-foreground">
                    {pitch[0] > 0 ? '+' : ''}{pitch[0]} semitones
                  </span>
                </div>
                <Slider
                  value={pitch}
                  onValueChange={setPitch}
                  min={-20}
                  max={20}
                  step={1}
                />
              </div>

              {/* Volume */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Volume</label>
                  <span className="text-sm text-muted-foreground">
                    {Math.round(volume[0] * 100)}%
                  </span>
                </div>
                <Slider
                  value={volume}
                  onValueChange={setVolume}
                  min={0}
                  max={1}
                  step={0.05}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Audio Player */}
          {audioUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Volume2 className="mr-2 h-5 w-5" />
                  Generated Audio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <WaveformVisualizer audioUrl={audioUrl} />
                <AudioPlayer src={audioUrl} />
                <div className="flex gap-2">
                  <Button
                    onClick={downloadAudio}
                    variant="outline"
                    className="flex-1"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                  <Button
                    onClick={shareAudio}
                    variant="outline"
                    className="flex-1"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                Powered by <strong>Piper TTS</strong> - a fast, high-quality
                text-to-speech engine running entirely on your server.
              </p>
              <p>
                No external APIs required. All processing happens locally for
                maximum privacy and speed.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
