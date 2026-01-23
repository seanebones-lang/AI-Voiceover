"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { VoiceSelect } from '@/components/voice-select'
import { WaveformVisualizer } from '@/components/waveform-visualizer'
import { AudioPlayer } from '@/components/audio-player'
import { 
  Wand2, Volume2, Download, Share2, Mic, Upload, Trash2,
  Smile, Frown, Angry, Heart, Zap, Moon, MessageSquare, Award,
  Radio, StopCircle, Loader2, CheckCircle2, AlertCircle
} from 'lucide-react'

// Emotion configurations
const EMOTIONS = [
  { id: 'neutral', label: 'Neutral', icon: MessageSquare, color: 'bg-slate-500' },
  { id: 'happy', label: 'Happy', icon: Smile, color: 'bg-yellow-500' },
  { id: 'sad', label: 'Sad', icon: Frown, color: 'bg-blue-500' },
  { id: 'angry', label: 'Angry', icon: Angry, color: 'bg-red-500' },
  { id: 'excited', label: 'Excited', icon: Zap, color: 'bg-orange-500' },
  { id: 'calm', label: 'Calm', icon: Heart, color: 'bg-green-500' },
  { id: 'whisper', label: 'Whisper', icon: Moon, color: 'bg-purple-500' },
  { id: 'serious', label: 'Serious', icon: Award, color: 'bg-gray-700' },
] as const

interface Voice {
  voice_id: string
  name: string
  language: string
  source: string
  description?: string
}

export function DashboardV2() {
  // State
  const [text, setText] = useState('')
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [selectedEmotion, setSelectedEmotion] = useState<string>('neutral')
  const [voices, setVoices] = useState<Voice[]>([])
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ samples: 0, duration: 0 })
  
  // Voice settings
  const [speed, setSpeed] = useState([1.0])
  const [volume, setVolume] = useState([1.0])
  
  // Clone voice state
  const [cloneFiles, setCloneFiles] = useState<File[]>([])
  const [cloneName, setCloneName] = useState('')
  const [cloning, setCloning] = useState(false)
  
  // Service status
  const [serviceStatus, setServiceStatus] = useState<'checking' | 'ready' | 'error'>('checking')

  // Check service health
  const checkServiceHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/tts', { method: 'OPTIONS' }).catch(() => null)
      setServiceStatus(response ? 'ready' : 'error')
    } catch {
      setServiceStatus('error')
    }
  }, [])

  const loadVoices = useCallback(async () => {
    try {
      const response = await fetch('/api/voices')
      if (!response.ok) {
        throw new Error(`Failed to load voices: ${response.status}`)
      }
      const data = await response.json()
      setVoices(data.voices || [])
      if (data.voices?.length > 0 && !selectedVoice) {
        const firstVoice = data.voices[0]
        if (firstVoice?.voice_id) {
          setSelectedVoice(firstVoice.voice_id)
        }
      }
    } catch (error) {
      console.error('Failed to load voices:', error)
      setError('Failed to load voices. Please refresh the page.')
    }
  }, [selectedVoice])

  useEffect(() => {
    checkServiceHealth()
    loadVoices()
  }, [checkServiceHealth, loadVoices])

  // Generate speech (REST API - full file)
  async function generateSpeech() {
    if (!text.trim() || !selectedVoice) {
      setError('Please enter text and select a voice')
      return
    }

    setLoading(true)
    setError(null)
    setAudioUrl(null)
    setAudioBlob(null)

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          voice_id: selectedVoice,
          emotion: selectedEmotion,
          speed: speed[0],
          volume: volume[0],
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Generation failed')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setAudioBlob(blob)
      setAudioUrl(url)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate speech')
    } finally {
      setLoading(false)
    }
  }

  // Clone voice
  async function handleCloneVoice() {
    if (!cloneName.trim() || cloneFiles.length === 0) {
      setError('Please provide a name and at least one audio file')
      return
    }

    setCloning(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('name', cloneName.trim())
      
      for (const file of cloneFiles) {
        formData.append('files', file)
      }

      const response = await fetch('/api/clone-voice', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Cloning failed')
      }

      const result = await response.json()
      
      // Refresh voices and select the new one
      await loadVoices()
      setSelectedVoice(result.voice_id)
      
      // Reset clone form
      setCloneName('')
      setCloneFiles([])
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone voice')
    } finally {
      setCloning(false)
    }
  }

  // File drop handler
  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).filter(f => 
      f.type.startsWith('audio/') || 
      /\.(wav|mp3|ogg|flac|m4a)$/i.test(f.name)
    )
    setCloneFiles(prev => [...prev, ...files].slice(0, 5))
  }

  // Download audio
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

  // Memoize expensive calculations
  const charCount = useMemo(() => text.length, [text])
  const wordCount = useMemo(() => {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length
  }, [text])
  const selectedVoiceData = useMemo(() => {
    return voices.find(v => v.voice_id === selectedVoice)
  }, [voices, selectedVoice])

  return (
    <main id="main-content" className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Animated background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-pink-500/10 rounded-full blur-3xl animate-pulse delay-500" />
      </div>

      <div className="relative container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500" aria-hidden="true">
              <Radio className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
              HumanMirage TTS
            </h1>
          </div>
          <p className="text-slate-400 text-lg">
            Studio-quality speech synthesis with real voice cloning
          </p>
          
          {/* Service status */}
          <div 
            className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700"
            aria-live="polite"
            aria-atomic="true"
          >
            {serviceStatus === 'checking' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-yellow-400" aria-hidden="true" />
                <span className="text-sm text-slate-400" aria-busy="true">Connecting...</span>
              </>
            )}
            {serviceStatus === 'ready' && (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-400" aria-hidden="true" />
                <span className="text-sm text-slate-400">Engine Ready</span>
              </>
            )}
            {serviceStatus === 'error' && (
              <>
                <AlertCircle className="h-4 w-4 text-red-400" aria-hidden="true" />
                <span className="text-sm text-slate-400">Service Unavailable</span>
              </>
            )}
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div 
            role="alert" 
            aria-live="assertive" 
            className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-2"
          >
            <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
            <button 
              onClick={() => setError(null)} 
              className="ml-auto text-red-400 hover:text-red-300"
              aria-label="Dismiss error message"
            >
              ×
            </button>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Text Input Card */}
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
              <CardHeader>
                <CardTitle as="h2" className="text-white">Text to Speech</CardTitle>
                <CardDescription className="text-slate-400">
                  Enter your text and generate natural-sounding speech
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Voice Selection */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="voice-select" className="text-sm font-medium text-slate-300 mb-2 block">
                      Voice
                    </label>
                    <VoiceSelect
                      id="voice-select"
                      voices={voices}
                      value={selectedVoice}
                      onChange={setSelectedVoice}
                    />
                    {selectedVoiceData?.source === 'cloned' && (
                      <p className="mt-1 text-xs text-purple-400">🎭 Cloned voice</p>
                    )}
                  </div>
                  
                  <div>
                    <label htmlFor="language-select" className="text-sm font-medium text-slate-300 mb-2 block">
                      Language
                    </label>
                    <select 
                      id="language-select"
                      aria-label="Select language"
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    >
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="pt">Portuguese</option>
                    </select>
                  </div>
                </div>

                {/* Emotion Selection */}
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-3 block">
                    Emotion
                  </label>
                  <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                    {EMOTIONS.map((emotion) => {
                      const Icon = emotion.icon
                      const isSelected = selectedEmotion === emotion.id
                      return (
                        <button
                          key={emotion.id}
                          onClick={() => setSelectedEmotion(emotion.id)}
                          className={`
                            flex flex-col items-center gap-1 p-3 rounded-lg border transition-all
                            ${isSelected 
                              ? `${emotion.color} border-transparent text-white shadow-lg scale-105` 
                              : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white'
                            }
                          `}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-xs">{emotion.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Text Input */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="tts-text-input" className="text-sm font-medium text-slate-300">
                      Your Text
                    </label>
                    <span className="text-xs text-slate-500">
                      {charCount.toLocaleString()} chars • {wordCount} words
                    </span>
                  </div>
                  <textarea
                    id="tts-text-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type or paste your text here..."
                    aria-label="Text to convert to speech"
                    aria-describedby="text-stats"
                    className="w-full min-h-[180px] px-4 py-3 rounded-lg bg-slate-800/50 border border-slate-700 text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                    maxLength={10000}
                  />
                  <div id="text-stats" className="sr-only" aria-live="polite">
                    {charCount.toLocaleString()} characters, {wordCount} words
                  </div>
                </div>

                {/* Generate Button */}
                <div className="flex gap-3">
                  <Button
                    onClick={generateSpeech}
                    disabled={loading || streaming || !text.trim() || !selectedVoice}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white border-0"
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Generating...
                      </>
                    ) : streaming ? (
                      <>
                        <Radio className="mr-2 h-5 w-5 animate-pulse" />
                        Streaming...
                      </>
                    ) : (
                      <>
                        <Wand2 className="mr-2 h-5 w-5" />
                        Generate Speech
                      </>
                    )}
                  </Button>
                  
                  {streaming && (
                    <Button
                      onClick={() => setStreaming(false)}
                      variant="outline"
                      className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                    >
                      <StopCircle className="h-5 w-5" />
                    </Button>
                  )}
                </div>

                {/* Progress indicator */}
                {streaming && (
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all"
                      style={{ width: `${Math.min(progress.duration * 10, 100)}%` }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Voice Settings Card */}
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white">Voice Settings</CardTitle>
                <CardDescription className="text-slate-400">
                  Fine-tune the voice characteristics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Speed */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-slate-300">Speed</label>
                      <span className="text-sm text-slate-500 font-mono">
                        {speed[0].toFixed(2)}x
                      </span>
                    </div>
                    <Slider
                      value={speed}
                      onValueChange={setSpeed}
                      min={0.5}
                      max={2.0}
                      step={0.1}
                      className="[&_[role=slider]]:bg-purple-500"
                    />
                  </div>

                  {/* Volume */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-slate-300">Volume</label>
                      <span className="text-sm text-slate-500 font-mono">
                        {Math.round(volume[0] * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={volume}
                      onValueChange={setVolume}
                      min={0}
                      max={1}
                      step={0.05}
                      className="[&_[role=slider]]:bg-cyan-500"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Voice Cloning Card */}
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Mic className="h-5 w-5 text-purple-400" />
                  Clone a Voice
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Upload 3-30 seconds of audio to clone any voice
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Voice name */}
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-2 block">
                    Voice Name
                  </label>
                  <input
                    type="text"
                    value={cloneName}
                    onChange={(e) => setCloneName(e.target.value)}
                    placeholder="My Custom Voice"
                    className="w-full px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                </div>

                {/* File drop zone */}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-purple-500/50 transition-colors"
                >
                  <Upload className="h-10 w-10 text-slate-500 mx-auto mb-3" />
                  <p className="text-slate-400 mb-2">
                    Drag & drop audio files here
                  </p>
                  <p className="text-xs text-slate-500">
                    WAV, MP3, OGG, FLAC • 3-30 seconds • Max 5 files
                  </p>
                  <input
                    type="file"
                    accept="audio/*"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || [])
                      setCloneFiles(prev => [...prev, ...files].slice(0, 5))
                    }}
                    className="hidden"
                    id="audio-upload"
                  />
                  <label
                    htmlFor="audio-upload"
                    className="mt-4 inline-block px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm cursor-pointer hover:bg-slate-700"
                  >
                    Browse Files
                  </label>
                </div>

                {/* File list */}
                {cloneFiles.length > 0 && (
                  <div className="space-y-2">
                    {cloneFiles.map((file, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50">
                        <Volume2 className="h-4 w-4 text-purple-400" />
                        <span className="text-sm text-slate-300 flex-1 truncate">
                          {file.name}
                        </span>
                        <span className="text-xs text-slate-500">
                          {(file.size / 1024 / 1024).toFixed(1)}MB
                        </span>
                        <button
                          onClick={() => setCloneFiles(cloneFiles.filter((_, j) => j !== i))}
                          className="text-slate-500 hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Clone button */}
                <Button
                  onClick={handleCloneVoice}
                  disabled={cloning || !cloneName.trim() || cloneFiles.length === 0}
                  className="w-full bg-purple-600 hover:bg-purple-500"
                >
                  {cloning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Cloning Voice...
                    </>
                  ) : (
                    <>
                      <Mic className="mr-2 h-4 w-4" />
                      Clone Voice
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Audio Player */}
            {audioUrl && (
              <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center text-white">
                    <Volume2 className="mr-2 h-5 w-5 text-cyan-400" />
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
                      className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      <Share2 className="mr-2 h-4 w-4" />
                      Share
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Cloned Voices */}
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white">Your Voices</CardTitle>
                <CardDescription className="text-slate-400">
                  Cloned voices ready to use
                </CardDescription>
              </CardHeader>
              <CardContent>
                {voices.filter(v => v.source === 'cloned').length > 0 ? (
                  <div className="space-y-2">
                    {voices.filter(v => v.source === 'cloned').map((voice) => (
                      <div
                        key={voice.voice_id}
                        className={`
                          flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all
                          ${selectedVoice === voice.voice_id 
                            ? 'bg-purple-500/20 border border-purple-500/50' 
                            : 'bg-slate-800/50 hover:bg-slate-800'
                          }
                        `}
                        onClick={() => setSelectedVoice(voice.voice_id)}
                      >
                        <div className="p-2 rounded-full bg-purple-500/20">
                          <Mic className="h-4 w-4 text-purple-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {voice.name}
                          </p>
                          <p className="text-xs text-slate-500">Cloned voice</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">
                    No cloned voices yet. Upload audio to create one!
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white">About</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-400 space-y-3">
                <p>
                  <strong className="text-purple-400">HumanMirage TTS v3</strong> — 
                  Production-grade speech synthesis with real voice cloning.
                </p>
                <ul className="space-y-1 text-slate-500">
                  <li>✓ True voice cloning (not API wrapper)</li>
                  <li>✓ 8 emotion presets</li>
                  <li>✓ Real-time streaming</li>
                  <li>✓ 100% self-hosted</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}
