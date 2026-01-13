"use client"

import { useState, useRef, useEffect } from 'react'
import { 
  Wand2, Play, Pause, Download, Volume2, Mic, 
  Settings, Sparkles, Radio, Users, FileText,
  ChevronDown, RefreshCw, Loader2
} from 'lucide-react'

// Emotion configurations
const EMOTIONS = [
  { id: 'neutral', label: 'Neutral', emoji: '😐', color: '#64748b' },
  { id: 'happy', label: 'Happy', emoji: '😊', color: '#eab308' },
  { id: 'sad', label: 'Sad', emoji: '😢', color: '#3b82f6' },
  { id: 'angry', label: 'Angry', emoji: '😠', color: '#ef4444' },
  { id: 'excited', label: 'Excited', emoji: '🤩', color: '#f97316' },
  { id: 'calm', label: 'Calm', emoji: '😌', color: '#22c55e' },
  { id: 'whisper', label: 'Whisper', emoji: '🤫', color: '#a855f7' },
  { id: 'serious', label: 'Serious', emoji: '🧐', color: '#6b7280' },
]

// Voice effect presets
const EFFECTS = [
  { id: 'none', label: 'None', icon: '🎵' },
  { id: 'radio', label: 'Radio', icon: '📻' },
  { id: 'stadium', label: 'Stadium', icon: '🏟️' },
  { id: 'robot', label: 'Robot', icon: '🤖' },
  { id: 'whisper', label: 'Whisper', icon: '🌙' },
  { id: 'warm', label: 'Warm', icon: '☀️' },
  { id: 'bright', label: 'Bright', icon: '✨' },
  { id: 'broadcast', label: 'Broadcast', icon: '🎙️' },
]

// Demo texts
const DEMO_TEXTS = [
  "Hello! I'm HumanMirage, a next-generation text-to-speech system with real emotion control.",
  "The quick brown fox jumps over the lazy dog near the riverbank on a sunny afternoon.",
  "Welcome to our podcast! Today we're discussing the future of artificial intelligence.",
  "Breaking news: Scientists have made a groundbreaking discovery that could change everything.",
  "Once upon a time, in a land far away, there lived a young adventurer seeking fortune.",
]

export default function PlaygroundPage() {
  // State
  const [text, setText] = useState(DEMO_TEXTS[0])
  const [selectedEmotion, setSelectedEmotion] = useState('neutral')
  const [selectedEffect, setSelectedEffect] = useState('none')
  const [selectedVoice, setSelectedVoice] = useState('')
  const [voices, setVoices] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generationTime, setGenerationTime] = useState<number | null>(null)
  
  // Audio settings
  const [speed, setSpeed] = useState(1.0)
  const [pitch, setPitch] = useState(0)
  
  // Refs
  const audioRef = useRef<HTMLAudioElement>(null)
  
  // Load voices on mount
  useEffect(() => {
    loadVoices()
  }, [])
  
  async function loadVoices() {
    try {
      const res = await fetch('/api/voices-v2')
      const data = await res.json()
      setVoices(data.voices || [])
      if (data.voices?.length > 0) {
        setSelectedVoice(data.voices[0].voice_id)
      }
    } catch (e) {
      console.error('Failed to load voices:', e)
    }
  }
  
  async function generateSpeech() {
    if (!text.trim()) {
      setError('Please enter some text')
      return
    }
    
    setLoading(true)
    setError(null)
    setAudioUrl(null)
    setGenerationTime(null)
    
    const startTime = Date.now()
    
    try {
      const res = await fetch('/api/tts-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          voice_id: selectedVoice || undefined,
          emotion: selectedEmotion,
          speed,
          effect: selectedEffect !== 'none' ? selectedEffect : undefined,
        }),
      })
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Generation failed')
      }
      
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
      setGenerationTime(Date.now() - startTime)
      
      // Auto-play
      if (audioRef.current) {
        audioRef.current.src = url
        audioRef.current.play()
        setPlaying(true)
      }
      
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate')
    } finally {
      setLoading(false)
    }
  }
  
  function togglePlayPause() {
    if (!audioRef.current || !audioUrl) return
    
    if (playing) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setPlaying(!playing)
  }
  
  function downloadAudio() {
    if (!audioUrl) return
    
    const a = document.createElement('a')
    a.href = audioUrl
    a.download = `humanmirage-${Date.now()}.wav`
    a.click()
  }
  
  function selectDemoText(index: number) {
    setText(DEMO_TEXTS[index])
  }
  
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[128px] animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-pink-500/3 rounded-full blur-[150px]" />
      </div>
      
      {/* Grid overlay */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(to right, white 1px, transparent 1px),
            linear-gradient(to bottom, white 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />
      
      <div className="relative container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-500 shadow-lg shadow-purple-500/25">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-5xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
                HumanMirage
              </span>
              <span className="text-white/80 ml-2">Playground</span>
            </h1>
          </div>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            Experience next-generation text-to-speech with real emotion control, 
            voice cloning, and studio-quality effects.
          </p>
        </div>
        
        {/* Main Grid */}
        <div className="grid lg:grid-cols-[1fr,380px] gap-6">
          {/* Left Panel - Input */}
          <div className="space-y-6">
            {/* Text Input */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-medium text-white/70 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Your Text
                </label>
                <span className="text-xs text-white/40">
                  {text.length} characters
                </span>
              </div>
              
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type or paste your text here..."
                className="w-full h-40 px-4 py-3 rounded-xl bg-black/30 border border-white/10 
                         text-white placeholder-white/30 resize-none
                         focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50
                         transition-all"
              />
              
              {/* Demo texts */}
              <div className="flex flex-wrap gap-2 mt-3">
                {DEMO_TEXTS.map((demo, i) => (
                  <button
                    key={i}
                    onClick={() => selectDemoText(i)}
                    className="px-3 py-1 text-xs rounded-full bg-white/5 text-white/50 
                             hover:bg-white/10 hover:text-white/80 transition-colors"
                  >
                    Demo {i + 1}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Emotion Selector */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
              <label className="text-sm font-medium text-white/70 flex items-center gap-2 mb-4">
                <Sparkles className="h-4 w-4" />
                Emotion
              </label>
              
              <div className="grid grid-cols-4 gap-2">
                {EMOTIONS.map((emotion) => (
                  <button
                    key={emotion.id}
                    onClick={() => setSelectedEmotion(emotion.id)}
                    className={`
                      flex flex-col items-center gap-1 p-3 rounded-xl transition-all duration-200
                      ${selectedEmotion === emotion.id
                        ? 'bg-white/10 ring-2 ring-white/30 scale-105'
                        : 'bg-white/[0.02] hover:bg-white/5'
                      }
                    `}
                  >
                    <span className="text-2xl">{emotion.emoji}</span>
                    <span className="text-xs text-white/60">{emotion.label}</span>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Voice Effects */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
              <label className="text-sm font-medium text-white/70 flex items-center gap-2 mb-4">
                <Radio className="h-4 w-4" />
                Voice Effect
              </label>
              
              <div className="grid grid-cols-4 gap-2">
                {EFFECTS.map((effect) => (
                  <button
                    key={effect.id}
                    onClick={() => setSelectedEffect(effect.id)}
                    className={`
                      flex flex-col items-center gap-1 p-3 rounded-xl transition-all duration-200
                      ${selectedEffect === effect.id
                        ? 'bg-white/10 ring-2 ring-cyan-500/50'
                        : 'bg-white/[0.02] hover:bg-white/5'
                      }
                    `}
                  >
                    <span className="text-xl">{effect.icon}</span>
                    <span className="text-xs text-white/60">{effect.label}</span>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Generate Button */}
            <button
              onClick={generateSpeech}
              disabled={loading || !text.trim()}
              className="w-full py-4 rounded-xl font-semibold text-lg
                       bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-600
                       hover:from-purple-500 hover:via-pink-500 hover:to-cyan-500
                       disabled:opacity-50 disabled:cursor-not-allowed
                       shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40
                       transition-all duration-300 flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="h-5 w-5" />
                  Generate Speech
                </>
              )}
            </button>
            
            {/* Error display */}
            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
                {error}
              </div>
            )}
          </div>
          
          {/* Right Panel - Controls & Output */}
          <div className="space-y-6">
            {/* Voice Selector */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
              <label className="text-sm font-medium text-white/70 flex items-center gap-2 mb-4">
                <Mic className="h-4 w-4" />
                Voice
              </label>
              
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 
                         text-white appearance-none cursor-pointer
                         focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              >
                {voices.map((voice) => (
                  <option key={voice.voice_id} value={voice.voice_id}>
                    {voice.name} {voice.source === 'cloned' ? '🎭' : ''}
                  </option>
                ))}
              </select>
              
              <button
                onClick={loadVoices}
                className="mt-2 text-xs text-white/40 hover:text-white/60 flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh voices
              </button>
            </div>
            
            {/* Speed & Pitch */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
              <label className="text-sm font-medium text-white/70 flex items-center gap-2 mb-4">
                <Settings className="h-4 w-4" />
                Settings
              </label>
              
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs text-white/50 mb-2">
                    <span>Speed</span>
                    <span>{speed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
                
                <div>
                  <div className="flex justify-between text-xs text-white/50 mb-2">
                    <span>Pitch</span>
                    <span>{pitch > 0 ? '+' : ''}{pitch} st</span>
                  </div>
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={pitch}
                    onChange={(e) => setPitch(parseInt(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </div>
              </div>
            </div>
            
            {/* Audio Player */}
            {audioUrl && (
              <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 border border-white/10 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Volume2 className="h-4 w-4 text-purple-400" />
                  <span className="text-sm font-medium text-white/70">Generated Audio</span>
                  {generationTime && (
                    <span className="ml-auto text-xs text-green-400">
                      {generationTime}ms
                    </span>
                  )}
                </div>
                
                <audio
                  ref={audioRef}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  className="hidden"
                />
                
                {/* Custom controls */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlayPause}
                    className="p-4 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    {playing ? (
                      <Pause className="h-6 w-6" />
                    ) : (
                      <Play className="h-6 w-6 ml-0.5" />
                    )}
                  </button>
                  
                  {/* Waveform placeholder */}
                  <div className="flex-1 h-12 rounded-lg bg-black/20 flex items-center gap-0.5 px-2">
                    {Array.from({ length: 40 }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-all duration-150 ${
                          playing ? 'bg-purple-400' : 'bg-white/20'
                        }`}
                        style={{
                          height: `${20 + Math.sin(i * 0.5) * 15 + Math.random() * 10}%`,
                          animationDelay: `${i * 50}ms`,
                        }}
                      />
                    ))}
                  </div>
                  
                  <button
                    onClick={downloadAudio}
                    className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    <Download className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
            
            {/* Stats */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-purple-400">8</div>
                  <div className="text-xs text-white/40">Emotions</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-cyan-400">8</div>
                  <div className="text-xs text-white/40">Effects</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-pink-400">&lt;200</div>
                  <div className="text-xs text-white/40">ms Latency</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-400">100%</div>
                  <div className="text-xs text-white/40">Self-Hosted</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="mt-12 text-center text-white/30 text-sm">
          <p>HumanMirage TTS v3 • Production-grade Text-to-Speech</p>
          <p className="mt-1">Built with real voice cloning, not API wrappers.</p>
        </div>
      </div>
    </div>
  )
}
