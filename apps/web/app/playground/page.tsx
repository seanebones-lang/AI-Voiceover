"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { SkipLink } from '@/components/skip-link'
import { EMOTIONS } from '@/lib/constants/emotions'
import { VOICE_EFFECTS } from '@/lib/constants/effects'
import { CLONED_TTS_MAX_CHARS, STANDARD_TTS_MAX_CHARS } from '@/lib/validation'
import { isXttsVoice } from '@/lib/tts/stock-voices'

type PlaygroundVoice = {
  voice_id: string
  name: string
  language?: string
  source: string
}

const API_SPECIAL_EFFECTS = new Set<string>([
  'none',
  'robot',
  'radio',
  'whisper',
  'deep',
  'chipmunk',
  'cave',
  'telephone',
  'underwater',
  'megaphone',
])

/** Map playground UI effects to the voice service's supported `special_effect` values. */
function playgroundEffectToApi(effectId: string): string {
  if (API_SPECIAL_EFFECTS.has(effectId)) return effectId
  if (effectId === 'broadcast') return 'radio'
  if (effectId === 'stadium') return 'cave'
  return 'none'
}
import { 
  Wand2, Play, Pause, Download, Volume2, Mic, 
  Settings, Sparkles, Radio, Users, FileText,
  ChevronDown, RefreshCw, Loader2
} from 'lucide-react'

// Use shared constants

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
  const [cloneVoicePreset, setCloneVoicePreset] = useState<'natural' | 'expressive' | 'stable'>('natural')
  const [voices, setVoices] = useState<PlaygroundVoice[]>([])
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
  
  const loadVoices = useCallback(async () => {
    try {
      // Check cache first (5 minute TTL)
      const cacheKey = 'voices_playground_cache_v2'
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) {
        try {
          const { data, timestamp } = JSON.parse(cached)
          const age = Date.now() - timestamp
          if (age < 5 * 60 * 1000) { // 5 minutes
            setVoices(data.voices || [])
            if (data.voices?.length > 0 && !selectedVoice) {
              setSelectedVoice(data.voices[0].voice_id)
            }
            return
          }
        } catch {
          // Invalid cache, fetch fresh
        }
      }

      const res = await fetch('/api/voices')
      const data = await res.json()
      setVoices(data.voices || [])
      
      // Cache the response
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({
          data,
          timestamp: Date.now()
        }))
      } catch {
        // SessionStorage may be unavailable
      }
      
      if (data.voices?.length > 0) {
        setSelectedVoice(data.voices[0].voice_id)
      }
    } catch (e) {
      console.error('Failed to load voices:', e)
    }
  }, [selectedVoice])

  // Load voices on mount
  useEffect(() => {
    loadVoices()
  }, [loadVoices])
  
  const generateSpeech = useCallback(async () => {
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
      const voiceId = selectedVoice || 'default_english'
      const res = await fetch('/api/tts-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          voice_id: voiceId,
          language: 'en',
          emotion: selectedEmotion,
          speed,
          pitch,
          volume: 1.0,
          reverb: 0,
          echo: 0,
          noise_reduction: false,
          special_effect: playgroundEffectToApi(selectedEffect),
          ...(voiceId.startsWith('clone_') ? { clone_preset: cloneVoicePreset } : {}),
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
  }, [text, selectedVoice, selectedEmotion, selectedEffect, speed, pitch, cloneVoicePreset])
  
  const togglePlayPause = useCallback(() => {
    if (!audioRef.current || !audioUrl) return
    
    if (playing) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setPlaying(!playing)
  }, [playing, audioUrl])
  
  const downloadAudio = useCallback(() => {
    if (!audioUrl) return
    
    const a = document.createElement('a')
    a.href = audioUrl
    a.download = `humanmirage-${Date.now()}.wav`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [audioUrl])
  
  const selectDemoText = useCallback((index: number) => {
    setText(DEMO_TEXTS[index])
  }, [])
  
  return (
    <>
      <SkipLink />
      <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
        {/* Animated background */}
        <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-0 left-1/4 w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] md:w-[500px] md:h-[500px] lg:w-[600px] lg:h-[600px] bg-purple-500/5 rounded-full blur-[64px] sm:blur-[96px] md:blur-[128px] animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-[250px] h-[250px] sm:w-[350px] sm:h-[350px] md:w-[450px] md:h-[450px] lg:w-[500px] lg:h-[500px] bg-cyan-500/5 rounded-full blur-[64px] sm:blur-[96px] md:blur-[128px] animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] md:w-[700px] md:h-[700px] lg:w-[800px] lg:h-[800px] bg-pink-500/3 rounded-full blur-[75px] sm:blur-[100px] md:blur-[125px] lg:blur-[150px]" />
        </div>
        
        {/* Grid overlay */}
        <div 
          className="fixed inset-0 pointer-events-none opacity-[0.02] bg-grid-pattern"
          aria-hidden="true"
        />
        
        <main id="main-content" className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12 max-w-6xl">
        {/* Header */}
        <header className="text-center mb-8 sm:mb-10 lg:mb-12" role="banner">
          <div className="inline-flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-500 shadow-lg shadow-purple-500/25" aria-hidden="true">
              <Sparkles className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
                HumanMirage
              </span>
              <span className="text-white/90 ml-1 sm:ml-2">Playground</span>
            </h1>
          </div>
          <p className="text-sm sm:text-base lg:text-lg text-white/80 max-w-2xl mx-auto px-4">
            Experience next-generation text-to-speech with real emotion control, 
            voice cloning, and studio-quality effects.
          </p>
        </header>
        
        {/* Main Grid */}
        <div className="grid lg:grid-cols-[1fr,380px] gap-4 sm:gap-6">
          {/* Left Panel - Input */}
          <div className="space-y-6">
            {/* Text Input */}
            <section aria-labelledby="text-input-label">
              <div className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <label id="text-input-label" htmlFor="playground-text-input" className="text-sm font-medium text-white/90 flex items-center gap-2">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    Your Text
                  </label>
                  <span className="text-xs text-white/70" aria-live="polite" aria-atomic="true">
                    <span className="sr-only">Character count: </span>
                    {text.length}
                    {isXttsVoice(selectedVoice) ? ` / ${CLONED_TTS_MAX_CHARS}` : ''} characters
                  </span>
                </div>
                
                <textarea
                  id="playground-text-input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type or paste your text here..."
                  aria-label="Text input for speech generation"
                  aria-describedby="text-input-help text-input-stats"
                  aria-required="true"
                  maxLength={
                    isXttsVoice(selectedVoice) ? CLONED_TTS_MAX_CHARS : STANDARD_TTS_MAX_CHARS
                  }
                  className="w-full h-32 sm:h-40 md:h-48 px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl bg-black/30 border border-white/10 
                           text-white placeholder-white/50 resize-none text-sm sm:text-base
                           focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-black focus:border-purple-500/50
                           transition-all duration-200"
                />
                <div id="text-input-help" className="sr-only">
                  Enter the text you want to convert to speech.
                  {isXttsVoice(selectedVoice)
                    ? ` Cloned voices allow up to ${CLONED_TTS_MAX_CHARS} characters per request.`
                    : ` Standard voices allow up to ${STANDARD_TTS_MAX_CHARS} characters.`}
                </div>
                <div id="text-input-stats" className="sr-only" aria-live="polite" aria-atomic="true">
                  {text.length} characters, {text.trim().split(/\s+/).filter(w => w.length > 0).length} words
                </div>
              
                {/* Demo texts */}
                <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label="Demo text presets">
                  {DEMO_TEXTS.map((demo, i) => (
                    <button
                      key={i}
                      onClick={() => selectDemoText(i)}
                      aria-label={`Load demo text ${i + 1}: ${demo.substring(0, 50)}...`}
                    className="px-3 py-1.5 text-xs rounded-full bg-white/5 text-white/70 
                             hover:bg-white/10 hover:text-white/90 transition-colors duration-200
                             focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-black"
                    >
                      Demo {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            </section>
            
            {/* Emotion Selector */}
            <section aria-labelledby="emotion-selector-label">
              <div className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm shadow-lg">
                <label id="emotion-selector-label" className="text-sm font-medium text-white/90 flex items-center gap-2 mb-3 sm:mb-4">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Emotion
                </label>
                <p className="text-xs text-white/60 mb-3">
                  Applied on the server with your speed and pitch sliders — changes pacing, tone, and light processing.
                </p>
              
              <div className="grid grid-cols-4 gap-2" role="group" aria-label="Select emotion">
                {EMOTIONS.map((emotion) => (
                  <button
                    key={emotion.id}
                    onClick={() => setSelectedEmotion(emotion.id)}
                    aria-label={`Select ${emotion.label} emotion`}
                    aria-pressed={selectedEmotion === emotion.id}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedEmotion(emotion.id)
                      }
                    }}
                    className={`
                      flex flex-col items-center gap-1 p-3 rounded-xl transition-all duration-200
                      ${selectedEmotion === emotion.id
                        ? 'bg-white/10 ring-2 ring-white/30 scale-105'
                        : 'bg-white/[0.02] hover:bg-white/5'
                      }
                      focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-black
                    `}
                  >
                    <span className="text-2xl" aria-hidden="true">{emotion.emoji}</span>
                    <span className="text-xs text-white/80">{emotion.label}</span>
                  </button>
                ))}
              </div>
              </div>
            </section>
            
            {/* Voice Effects */}
            <section aria-labelledby="voice-effect-label">
              <div className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm shadow-lg">
                <label id="voice-effect-label" className="text-sm font-medium text-white/90 flex items-center gap-2 mb-3 sm:mb-4">
                  <Radio className="h-4 w-4" aria-hidden="true" />
                  Voice Effect
                </label>
              
              <div className="grid grid-cols-4 gap-2" role="group" aria-label="Select voice effect">
                {VOICE_EFFECTS.map((effect) => (
                  <button
                    key={effect.id}
                    onClick={() => setSelectedEffect(effect.id)}
                    aria-label={`Select ${effect.label} effect`}
                    aria-pressed={selectedEffect === effect.id}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedEffect(effect.id)
                      }
                    }}
                    className={`
                      flex flex-col items-center gap-1 p-3 rounded-xl transition-all duration-200
                      ${selectedEffect === effect.id
                        ? 'bg-white/10 ring-2 ring-cyan-500/50'
                        : 'bg-white/[0.02] hover:bg-white/5'
                      }
                      focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 focus:ring-offset-black
                    `}
                  >
                    <span className="text-xl" aria-hidden="true">{effect.icon}</span>
                    <span className="text-xs text-white/80">{effect.label}</span>
                  </button>
                ))}
              </div>
              </div>
            </section>
            
            {/* Generate Button */}
            <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
              {loading && 'Generating speech, please wait'}
              {!loading && audioUrl && 'Speech generated successfully'}
            </div>
            <button
              onClick={generateSpeech}
              disabled={loading || !text.trim()}
              aria-label={loading ? 'Generating speech, please wait' : 'Generate speech from text'}
              aria-busy={loading}
              className="w-full py-3 sm:py-4 rounded-lg sm:rounded-xl font-semibold text-base sm:text-lg
                       bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-600
                       hover:from-purple-500 hover:via-pink-500 hover:to-cyan-500
                       disabled:opacity-50 disabled:cursor-not-allowed
                       shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40
                       transition-all duration-300 flex items-center justify-center gap-2 sm:gap-3
                       focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-black"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  <span>Generating...</span>
                  <span className="sr-only">Please wait while your speech is being generated</span>
                </>
              ) : (
                <>
                  <Wand2 className="h-5 w-5" aria-hidden="true" />
                  Generate Speech
                </>
              )}
            </button>
            
            {/* Error display */}
            {error && (
              <div 
                className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400"
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
              >
                <span className="sr-only">Error: </span>
                {error}
              </div>
            )}
          </div>
          
          {/* Right Panel - Controls & Output */}
          <div className="space-y-6">
            {/* Voice Selector */}
            <section aria-labelledby="voice-selector-label">
              <div className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm shadow-lg">
                <label id="voice-selector-label" htmlFor="playground-voice-select" className="text-sm font-medium text-white/90 flex items-center gap-2 mb-3 sm:mb-4">
                  <Mic className="h-4 w-4" aria-hidden="true" />
                  Voice
                </label>
                
                <select
                  id="playground-voice-select"
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  aria-label="Select voice for speech generation"
                  aria-describedby="voice-selector-help"
                  className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 
                           text-white appearance-none cursor-pointer
                           focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-black"
                >
                  {voices.length === 0 ? (
                    <option value="">Loading voices...</option>
                  ) : (
                    voices.map((voice) => (
                      <option key={voice.voice_id} value={voice.voice_id}>
                        {voice.name} {voice.source === 'cloned' ? '🎭' : ''}
                      </option>
                    ))
                  )}
                </select>
                <div id="voice-selector-help" className="sr-only">
                  Choose a voice for text-to-speech generation. Cloned voices are marked with an emoji.
                </div>
                
                <button
                  onClick={loadVoices}
                  aria-label="Refresh available voices list"
                  className="mt-2 text-xs text-white/70 hover:text-white/90 flex items-center gap-1
                           focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-black rounded px-2 py-1"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  Refresh voices
                </button>

                {selectedVoice.startsWith('clone_') && (
                  <div className="mt-4">
                    <label htmlFor="playground-clone-preset" className="text-xs text-white/80 block mb-2">
                      Clone delivery (XTTS)
                    </label>
                    <select
                      id="playground-clone-preset"
                      value={cloneVoicePreset}
                      onChange={(e) =>
                        setCloneVoicePreset(e.target.value as 'natural' | 'expressive' | 'stable')
                      }
                      className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm
                               focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-black"
                    >
                      <option value="natural">Natural</option>
                      <option value="expressive">Expressive</option>
                      <option value="stable">Stable</option>
                    </select>
                  </div>
                )}
              </div>
            </section>
            
            {/* Speed & Pitch */}
            <section aria-labelledby="settings-label">
              <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm shadow-lg">
                <label id="settings-label" className="text-sm font-medium text-white/90 flex items-center gap-2 mb-4">
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  Settings
                </label>
              
              <div className="space-y-4" role="group" aria-label="Audio playback settings">
                <div>
                  <label htmlFor="playground-speed-slider" className="flex justify-between text-xs text-white/80 mb-2">
                    <span>Speed</span>
                    <span aria-live="polite" aria-atomic="true">
                      <span className="sr-only">Current speed: </span>
                      {speed.toFixed(2)}x
                    </span>
                  </label>
                  <input
                    id="playground-speed-slider"
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    aria-label="Speech speed"
                    aria-valuemin={0.5}
                    aria-valuemax={2}
                    aria-valuenow={speed}
                    aria-valuetext={`${speed.toFixed(2)} times normal speed`}
                    className="w-full accent-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-black transition-colors duration-200"
                  />
                </div>
                
                <div>
                  <label htmlFor="playground-pitch-slider" className="flex justify-between text-xs text-white/80 mb-2">
                    <span>Pitch</span>
                    <span aria-live="polite" aria-atomic="true">
                      <span className="sr-only">Current pitch: </span>
                      {pitch > 0 ? '+' : ''}{pitch} semitones
                    </span>
                  </label>
                  <input
                    id="playground-pitch-slider"
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={pitch}
                    onChange={(e) => setPitch(parseInt(e.target.value))}
                    aria-label="Voice pitch"
                    aria-valuemin={-12}
                    aria-valuemax={12}
                    aria-valuenow={pitch}
                    aria-valuetext={`${pitch > 0 ? '+' : ''}${pitch} semitones`}
                    className="w-full accent-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 focus:ring-offset-black transition-colors duration-200"
                  />
                </div>
              </div>
              </div>
            </section>
            
            {/* Audio Player */}
            {audioUrl && (
              <section aria-labelledby="audio-player-label">
                <div className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 border border-white/10 backdrop-blur-sm shadow-lg shadow-purple-500/10">
                  <div className="flex items-center gap-2 mb-4">
                    <Volume2 className="h-4 w-4 text-purple-400" aria-hidden="true" />
                    <h3 id="audio-player-label" className="text-sm font-medium text-white/90">Generated Audio</h3>
                    {generationTime && (
                      <span className="ml-auto text-xs text-green-400" aria-label={`Generated in ${generationTime} milliseconds`}>
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
                    aria-label="Generated speech audio"
                  />
                  
                  {/* Custom controls */}
                  <div className="flex items-center gap-3" role="group" aria-label="Audio playback controls">
                    <button
                      onClick={togglePlayPause}
                      aria-label={playing ? 'Pause audio playback' : 'Play audio playback'}
                      aria-pressed={playing}
                      className="p-3 sm:p-4 rounded-full bg-white/10 hover:bg-white/20 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-black"
                    >
                      {playing ? (
                        <Pause className="h-6 w-6" aria-hidden="true" />
                      ) : (
                        <Play className="h-6 w-6 ml-0.5" aria-hidden="true" />
                      )}
                    </button>
                  
                  {/* Waveform placeholder */}
                  <div 
                    className="flex-1 h-12 rounded-lg bg-black/20 flex items-center gap-0.5 px-2"
                    role="img"
                    aria-label="Audio waveform visualization"
                    aria-hidden="true"
                  >
                    {Array.from({ length: 40 }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-all duration-150 ${
                          playing ? 'bg-purple-400' : 'bg-white/20'
                        }`}
                        style={{
                          height: `${20 + Math.sin(i * 0.5) * 15 + (i % 3) * 5}%`,
                          animationDelay: `${i * 50}ms`,
                        }}
                      />
                    ))}
                  </div>
                  
                  <button
                    onClick={downloadAudio}
                    aria-label="Download generated audio file"
                    className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-black"
                  >
                    <Download className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                </div>
              </section>
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
        <footer className="mt-12 text-center text-white/70 text-sm" role="contentinfo">
          <p>HumanMirage TTS v3 • Production-grade Text-to-Speech</p>
          <p className="mt-1">Built with real voice cloning, not API wrappers.</p>
        </footer>
        </main>
      </div>
    </>
  )
}
