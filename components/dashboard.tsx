"use client"

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'

// Icons as simple SVG components
const Icons = {
  Wand2: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg>,
  Volume2: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>,
  Download: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>,
  Mic: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>,
  Upload: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>,
  Trash: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>,
  Plus: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>,
  Play: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  Square: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>,
  MessageCircle: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>,
  Layers: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12.5-8.58 3.91a2 2 0 0 1-1.66 0L2 12.5"/><path d="m22 17.5-8.58 3.91a2 2 0 0 1-1.66 0L2 17.5"/></svg>,
  AlertCircle: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>,
  Check: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
}

interface Voice {
  voice_id: string
  name: string
  language?: string
  source: string
}

type TabType = 'tts' | 'clone' | 'conversation' | 'compare'

// Helper function for time formatting
function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return date.toLocaleDateString()
}

export function Dashboard() {
  // Active tab
  const [activeTab, setActiveTab] = useState<TabType>('tts')
  
  // TTS State
  const [text, setText] = useState('')
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [voices, setVoices] = useState<Voice[]>([])
  const [loading, setLoading] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [speed, setSpeed] = useState([1.0])
  const [pitch, setPitch] = useState([0])
  const [volume, setVolume] = useState([1.0])

  // Audio Effects State
  const [reverb, setReverb] = useState([0])
  const [echo, setEcho] = useState([0])
  const [noiseReduction, setNoiseReduction] = useState(false)
  const [showEffects, setShowEffects] = useState(true) // Show by default now
  
  // Special Effects
  const [specialEffect, setSpecialEffect] = useState<string>('none')
  
  // History State
  const [history, setHistory] = useState<Array<{
    id: string
    text: string
    voiceId: string
    voiceName: string
    audioUrl: string
    timestamp: Date
  }>>([])
  
  // Service health state
  const [serviceHealth, setServiceHealth] = useState<'checking' | 'healthy' | 'degraded' | 'offline'>('checking')
  
  // Check service health
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health')
        const data = await res.json()
        if (data.status === 'healthy' || data.status === 'ok') {
          setServiceHealth('healthy')
        } else if (data.status === 'degraded') {
          setServiceHealth('degraded')
        } else {
          setServiceHealth('offline')
        }
      } catch {
        setServiceHealth('offline')
      }
    }
    checkHealth()
    const interval = setInterval(checkHealth, 30000) // Check every 30s
    return () => clearInterval(interval)
  }, [])
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Enter to generate
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && text.trim() && selectedVoice && !loading) {
        e.preventDefault()
        generateSpeech()
      }
      // Ctrl/Cmd + D to download
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && audioUrl) {
        e.preventDefault()
        downloadAudio()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [text, selectedVoice, loading, audioUrl])

  // Clone State
  const [cloneName, setCloneName] = useState('')
  const [cloneDescription, setCloneDescription] = useState('')
  const [cloneFiles, setCloneFiles] = useState<File[]>([])
  const [cloneLoading, setCloneLoading] = useState(false)
  const [cloneError, setCloneError] = useState<string | null>(null)
  const [cloneSuccess, setCloneSuccess] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Conversation State
  const [conversationMessages, setConversationMessages] = useState<Array<{
    id: number
    speaker: string
    voiceId: string
    text: string
  }>>([{ id: 1, speaker: '', voiceId: '', text: '' }])
  const [conversationLoading, setConversationLoading] = useState(false)
  const [conversationAudios, setConversationAudios] = useState<string[]>([])
  const [conversationError, setConversationError] = useState<string | null>(null)

  // Compare State
  const [compareText, setCompareText] = useState('')
  const [compareVoice1, setCompareVoice1] = useState('')
  const [compareVoice2, setCompareVoice2] = useState('')
  const [compareAudio1, setCompareAudio1] = useState<string | null>(null)
  const [compareAudio2, setCompareAudio2] = useState<string | null>(null)
  const [compareLoading1, setCompareLoading1] = useState(false)
  const [compareLoading2, setCompareLoading2] = useState(false)
  
  // Voice preview
  const [previewLoading, setPreviewLoading] = useState(false)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  // Load voices on mount
  useEffect(() => {
    loadVoices()
  }, [])

  async function previewVoice(voiceId: string) {
    if (previewLoading) return
    setPreviewLoading(true)
    
    try {
      // Stop any currently playing preview
      if (previewAudioRef.current) {
        previewAudioRef.current.pause()
        previewAudioRef.current = null
      }
      
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello! This is a preview of how this voice sounds.',
          voice_id: voiceId,
          speed: 1.0,
          pitch: 0,
          volume: 1.0,
        }),
      })
      
      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        previewAudioRef.current = audio
        audio.play()
        audio.onended = () => URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Preview failed:', err)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function loadVoices() {
    try {
      const response = await fetch('/api/voices')
      const data = await response.json()
      setVoices(data.voices || [])
      if (data.voices?.length > 0) {
        setSelectedVoice(data.voices[0].voice_id)
      }
    } catch (err) {
      console.error('Failed to load voices:', err)
    }
  }

  // ============ TTS Functions ============
  async function generateSpeech() {
    if (!text.trim() || !selectedVoice) {
      setError('Please enter text and select a voice')
      return
    }

    setLoading(true)
    setAudioUrl(null)
    setAudioBlob(null)
    setError(null)

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          voice_id: selectedVoice,
          speed: speed[0],
          pitch: pitch[0],
          volume: volume[0],
          reverb: reverb[0],
          echo: echo[0],
          noise_reduction: noiseReduction,
          special_effect: specialEffect,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || errorData.details?.message || 'Generation failed')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setAudioBlob(blob)
      setAudioUrl(url)
      
      // Add to history
      const voice = voices.find(v => v.voice_id === selectedVoice)
      setHistory(prev => [{
        id: Date.now().toString(),
        text: text.trim(),
        voiceId: selectedVoice,
        voiceName: voice?.name || selectedVoice,
        audioUrl: url,
        timestamp: new Date()
      }, ...prev].slice(0, 20)) // Keep last 20
    } catch (err) {
      console.error('Generation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate speech')
    } finally {
      setLoading(false)
    }
  }

  function downloadAudio() {
    if (!audioBlob) return
    const url = URL.createObjectURL(audioBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nexteleven-${Date.now()}.mp3`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ============ Voice Clone Functions ============
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length + cloneFiles.length > 5) {
      setCloneError('Maximum 5 files allowed')
      return
    }
    setCloneFiles(prev => [...prev, ...files])
    setCloneError(null)
  }

  function removeFile(index: number) {
    setCloneFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setRecordedBlob(blob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      setCloneError('Microphone access denied')
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  function addRecordingToFiles() {
    if (recordedBlob && cloneFiles.length < 5) {
      const file = new File([recordedBlob], `recording-${Date.now()}.webm`, { type: 'audio/webm' })
      setCloneFiles(prev => [...prev, file])
      setRecordedBlob(null)
    }
  }

  async function cloneVoice() {
    if (!cloneName.trim()) {
      setCloneError('Please enter a voice name')
      return
    }
    if (cloneFiles.length === 0) {
      setCloneError('Please upload at least one audio file')
      return
    }

    setCloneLoading(true)
    setCloneError(null)
    setCloneSuccess(null)

    try {
      const formData = new FormData()
      formData.append('name', cloneName.trim())
      if (cloneDescription) formData.append('description', cloneDescription)
      cloneFiles.forEach(file => formData.append('files', file))

      const response = await fetch('/api/clone-voice', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Clone failed')
      }

      setCloneSuccess(`Voice "${cloneName}" cloned successfully! Voice ID: ${data.voice_id}`)
      setCloneName('')
      setCloneDescription('')
      setCloneFiles([])
      await loadVoices() // Refresh voice list
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : 'Failed to clone voice')
    } finally {
      setCloneLoading(false)
    }
  }

  // ============ Conversation Functions ============
  function addConversationMessage() {
    setConversationMessages(prev => [...prev, {
      id: Date.now(),
      speaker: '',
      voiceId: '',
      text: ''
    }])
  }

  function updateConversationMessage(id: number, field: string, value: string) {
    setConversationMessages(prev => prev.map(msg =>
      msg.id === id ? { ...msg, [field]: value } : msg
    ))
  }

  function removeConversationMessage(id: number) {
    setConversationMessages(prev => prev.filter(msg => msg.id !== id))
  }

  async function generateConversation() {
    const validMessages = conversationMessages.filter(m => m.text.trim() && m.voiceId)
    
    if (validMessages.length === 0) {
      setConversationError('Please add at least one message with text and voice')
      return
    }

    setConversationLoading(true)
    setConversationError(null)
    setConversationAudios([])

    try {
      const audioUrls: string[] = []
      
      for (const msg of validMessages) {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: msg.text.trim(),
            voice_id: msg.voiceId,
          }),
        })

        if (!response.ok) {
          throw new Error(`Failed to generate audio for ${msg.speaker || 'speaker'}`)
        }

        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        audioUrls.push(url)
      }

      setConversationAudios(audioUrls)
    } catch (err) {
      setConversationError(err instanceof Error ? err.message : 'Failed to generate conversation')
    } finally {
      setConversationLoading(false)
    }
  }

  // ============ Compare Functions ============
  async function generateCompare(voiceNum: 1 | 2) {
    const voiceId = voiceNum === 1 ? compareVoice1 : compareVoice2
    if (!compareText.trim() || !voiceId) {
      setError('Please enter text and select a voice')
      return
    }

    if (voiceNum === 1) setCompareLoading1(true)
    else setCompareLoading2(true)

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: compareText.trim(), voice_id: voiceId }),
      })

      if (!response.ok) throw new Error('Generation failed')

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      
      if (voiceNum === 1) setCompareAudio1(url)
      else setCompareAudio2(url)
    } catch (err) {
      setError('Failed to generate comparison audio')
    } finally {
      if (voiceNum === 1) setCompareLoading1(false)
      else setCompareLoading2(false)
    }
  }

  // ============ Render ============
  const charCount = text.length
  const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Icons.Volume2 />
              </div>
              <div>
                <h1 className="text-xl font-bold">NextEleven</h1>
                <p className="text-xs text-muted-foreground">Studio-Quality Voice AI</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border ${
                serviceHealth === 'healthy' ? 'bg-green-500/10 text-green-500 border-green-500/30' :
                serviceHealth === 'degraded' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' :
                serviceHealth === 'offline' ? 'bg-red-500/10 text-red-500 border-red-500/30' :
                'bg-muted text-muted-foreground border-border'
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  serviceHealth === 'healthy' ? 'bg-green-500 animate-pulse' :
                  serviceHealth === 'degraded' ? 'bg-yellow-500' :
                  serviceHealth === 'offline' ? 'bg-red-500' :
                  'bg-muted-foreground animate-pulse'
                }`} />
                {serviceHealth === 'checking' ? 'Checking...' :
                 serviceHealth === 'healthy' ? 'Online' :
                 serviceHealth === 'degraded' ? 'Degraded' : 'Offline'}
              </div>
              <span className="px-3 py-1 text-xs font-mono rounded-full bg-primary/20 text-primary border border-primary/30">
                v2.2
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="border-b border-border bg-card/50">
        <div className="container mx-auto px-4">
          <div className="flex gap-1">
            {[
              { id: 'tts' as TabType, label: 'Text to Speech', icon: Icons.Wand2 },
              { id: 'clone' as TabType, label: 'Clone Voice', icon: Icons.Mic },
              { id: 'conversation' as TabType, label: 'Conversation', icon: Icons.MessageCircle },
              { id: 'compare' as TabType, label: 'Compare', icon: Icons.Layers },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive flex items-center gap-3 animate-slide-up">
            <div className="p-2 rounded-full bg-destructive/20">
              <Icons.AlertCircle />
            </div>
            <div className="flex-1">
              <p className="font-medium">Generation Failed</p>
              <p className="text-sm opacity-80">{error}</p>
            </div>
            <button 
              onClick={() => setError(null)} 
              className="p-1 hover:bg-destructive/20 rounded transition-colors"
              title="Dismiss"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
            </button>
          </div>
        )}

        {/* ============ TTS TAB ============ */}
        {activeTab === 'tts' && (
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Text to Speech</CardTitle>
                  <CardDescription>Enter your text and generate natural-sounding speech</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Quick Presets */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground mr-2 self-center">Try:</span>
                {[
                  { label: "Demo", text: "Hello! Welcome to NextEleven, the most advanced voice synthesis platform." },
                  { label: "Narration", text: "In a world where technology and humanity converge, one voice stood apart from the rest." },
                  { label: "Podcast", text: "Hey everyone! Welcome back to another episode. Today we're diving deep into a topic I know you've all been asking about." },
                ].map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => setText(preset.text)}
                    className="px-2.5 py-1 text-xs rounded-full bg-secondary hover:bg-secondary/80 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              
              {/* Voice Selection */}
              <div>
                <label className="text-sm font-medium mb-2 block">Select Voice</label>
                <div className="flex gap-2">
                  <select
                  value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-lg border bg-background"
                  >
                      <option value="">Select a voice...</option>
                      {voices.filter(v => v.source === 'cloned').length > 0 && (
                        <optgroup label="🎤 Cloned Voices">
                          {voices.filter(v => v.source === 'cloned').map(v => (
                            <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                          ))}
                        </optgroup>
                      )}
                    <optgroup label="🌐 Standard Voices">
                      {voices.filter(v => v.source !== 'cloned').map(v => (
                        <option key={v.voice_id} value={v.voice_id}>
                          {v.name} ({v.language || 'en'})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => selectedVoice && previewVoice(selectedVoice)}
                    disabled={!selectedVoice || previewLoading}
                    title="Preview voice"
                    className="shrink-0"
                  >
                    {previewLoading ? (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    ) : (
                      <Icons.Play />
                    )}
                  </Button>
                </div>
              </div>

              {/* Text Input */}
              <div>
                <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">Your Text</label>
                      <span className="text-xs text-muted-foreground">{charCount} chars • {wordCount} words</span>
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
                className={`w-full relative overflow-hidden ${loading ? 'animate-pulse-glow' : ''}`} 
                size="lg"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                    <span className="ml-2">Generating...</span>
                  </>
                ) : (
                  <>
                    <Icons.Wand2 />
                    <span className="ml-2">Generate Voice-Over</span>
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

              {/* Voice Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Voice Settings</CardTitle>
                  <CardDescription>Fine-tune the voice characteristics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-sm font-medium">Speed</label>
                      <span className="text-sm text-muted-foreground">{speed[0].toFixed(2)}x</span>
                    </div>
                    <Slider value={speed} onValueChange={setSpeed} min={0.5} max={2.0} step={0.1} />
                  </div>
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-sm font-medium">Pitch</label>
                      <span className="text-sm text-muted-foreground">{pitch[0] > 0 ? '+' : ''}{pitch[0]} st</span>
                    </div>
                    <Slider value={pitch} onValueChange={setPitch} min={-20} max={20} step={1} />
                  </div>
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-sm font-medium">Volume</label>
                      <span className="text-sm text-muted-foreground">{Math.round(volume[0] * 100)}%</span>
                    </div>
                    <Slider value={volume} onValueChange={setVolume} min={0} max={1} step={0.05} />
                  </div>
                  
                  {/* Audio Effects Section */}
                  <div className="pt-4 border-t">
                    <button 
                      onClick={() => setShowEffects(!showEffects)}
                      className="w-full flex items-center justify-between text-sm font-medium mb-3 hover:text-primary transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                        Audio Effects
                      </span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showEffects ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    
                    {showEffects && (
                      <div className="space-y-4 animate-in slide-in-from-top-2">
                        <div>
                          <div className="flex justify-between mb-2">
                            <label className="text-sm font-medium">Reverb</label>
                            <span className="text-sm text-muted-foreground">{Math.round(reverb[0] * 100)}%</span>
                          </div>
                          <Slider value={reverb} onValueChange={setReverb} min={0} max={1} step={0.05} />
                        </div>
                        <div>
                          <div className="flex justify-between mb-2">
                            <label className="text-sm font-medium">Echo</label>
                            <span className="text-sm text-muted-foreground">{Math.round(echo[0] * 100)}%</span>
                          </div>
                          <Slider value={echo} onValueChange={setEcho} min={0} max={1} step={0.05} />
                        </div>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={noiseReduction}
                            onChange={(e) => setNoiseReduction(e.target.checked)}
                            className="w-4 h-4 rounded border-input bg-background"
                          />
                          <span className="text-sm font-medium">Noise Reduction</span>
                        </label>
                        
                        {/* Special Effects */}
                        <div className="pt-4 border-t">
                          <label className="text-sm font-medium mb-3 block">🎭 Special Effect</label>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { id: 'none', label: 'None', icon: '🔇' },
                              { id: 'robot', label: 'Robot', icon: '🤖' },
                              { id: 'radio', label: 'Radio', icon: '📻' },
                              { id: 'whisper', label: 'Whisper', icon: '🤫' },
                              { id: 'deep', label: 'Deep', icon: '🎸' },
                              { id: 'chipmunk', label: 'Chipmunk', icon: '🐿️' },
                              { id: 'cave', label: 'Cave', icon: '🦇' },
                              { id: 'telephone', label: 'Phone', icon: '☎️' },
                              { id: 'underwater', label: 'Underwater', icon: '🐠' },
                              { id: 'megaphone', label: 'Megaphone', icon: '📢' },
                            ].map(effect => (
                              <button
                                key={effect.id}
                                onClick={() => setSpecialEffect(effect.id)}
                                className={`p-2 rounded-lg text-xs font-medium transition-all ${
                                  specialEffect === effect.id
                                    ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background'
                                    : 'bg-secondary hover:bg-secondary/80'
                                }`}
                              >
                                <span className="text-base">{effect.icon}</span>
                                <br />
                                {effect.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Audio Player Sidebar */}
            <div className="space-y-6">
              {audioUrl && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icons.Volume2 />
                      Generated Audio
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <audio src={audioUrl} controls className="w-full" />
                    <div className="flex gap-2">
                      <Button onClick={downloadAudio} variant="outline" className="flex-1">
                        <Icons.Download />
                        <span className="ml-2">Download</span>
                      </Button>
                      <Button 
                        variant="outline" 
                        className="flex-1"
                        onClick={async () => {
                          if (audioBlob) {
                            try {
                              await navigator.clipboard.write([
                                new ClipboardItem({ [audioBlob.type]: audioBlob })
                              ])
                              // Show brief success state
                              const btn = document.activeElement as HTMLButtonElement
                              if (btn) {
                                const originalText = btn.innerHTML
                                btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span class="ml-2">Copied!</span>'
                                setTimeout(() => btn.innerHTML = originalText, 1500)
                              }
                            } catch {
                              // Fallback: copy text instead
                              await navigator.clipboard.writeText(text)
                            }
                          }
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        <span className="ml-2">Copy</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>About</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>Powered by <strong>edge-tts</strong> + <strong>Coqui XTTS</strong></p>
                  <p>100% self-hosted. No external API keys.</p>
                  <p className="text-xs pt-2 border-t mt-3">
                    <span className="text-primary">⌘/Ctrl + Enter</span> to generate<br/>
                    <span className="text-primary">⌘/Ctrl + D</span> to download
                  </p>
                </CardContent>
              </Card>
              
              {/* History */}
              {history.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Recent ({history.length})</CardTitle>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const data = history.map(h => ({
                              text: h.text,
                              voice: h.voiceName,
                              timestamp: h.timestamp.toISOString()
                            }))
                            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = `nexteleven-history-${new Date().toISOString().slice(0,10)}.json`
                            a.click()
                          }}
                          className="text-xs text-muted-foreground hover:text-primary transition-colors"
                          title="Export history"
                        >
                          Export
                        </button>
                        <button 
                          onClick={() => setHistory([])}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-[250px] overflow-y-auto">
                    {history.map((item) => (
                      <div 
                        key={item.id}
                        className="group p-2 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors cursor-pointer"
                        onClick={() => {
                          setAudioUrl(item.audioUrl)
                          setText(item.text)
                          setSelectedVoice(item.voiceId)
                        }}
                      >
                        <p className="text-xs font-medium truncate">{item.text.substring(0, 40)}...</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-muted-foreground">{item.voiceName}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatTimeAgo(item.timestamp)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ============ CLONE TAB ============ */}
        {activeTab === 'clone' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icons.Mic />
                  Clone Your Voice
                </CardTitle>
              <CardDescription>
                  Upload 1-5 audio samples (30+ seconds total) of clear speech for best results
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Success/Error Messages */}
                {cloneSuccess && (
                  <div className="p-4 rounded-lg bg-primary/10 border border-primary/30 text-primary flex items-center gap-2">
                    <Icons.Check />
                    {cloneSuccess}
                  </div>
                )}
                {cloneError && (
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
                    {cloneError}
                  </div>
                )}

                {/* Voice Name */}
              <div>
                  <label className="text-sm font-medium mb-2 block">Voice Name *</label>
                  <input
                    type="text"
                    value={cloneName}
                    onChange={(e) => setCloneName(e.target.value)}
                    placeholder="e.g., My Voice"
                    className="w-full px-4 py-3 rounded-lg border bg-background"
                    maxLength={50}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Description (Optional)</label>
                  <input
                    type="text"
                    value={cloneDescription}
                    onChange={(e) => setCloneDescription(e.target.value)}
                    placeholder="e.g., Professional narrator voice"
                    className="w-full px-4 py-3 rounded-lg border bg-background"
                    maxLength={100}
                />
              </div>

                {/* Recording */}
              <div>
                  <label className="text-sm font-medium mb-2 block">Record Your Voice</label>
                  <div className="p-6 rounded-lg border border-dashed border-border bg-card text-center">
                    <div className="flex flex-col items-center gap-4">
                      <button
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
                          isRecording 
                            ? 'bg-destructive text-destructive-foreground animate-pulse' 
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                      >
                        {isRecording ? <Icons.Square /> : <Icons.Mic />}
                      </button>
                      <p className="text-sm text-muted-foreground">
                        {isRecording ? '🔴 Recording... Click to stop' : 'Click to start recording'}
                      </p>
                      {recordedBlob && (
                        <div className="w-full space-y-2">
                          <audio src={URL.createObjectURL(recordedBlob)} controls className="w-full" />
                          <Button onClick={addRecordingToFiles} variant="outline" className="w-full">
                            <Icons.Plus />
                            <span className="ml-2">Add to Samples</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* File Upload */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Or Upload Audio Files</label>
                  <div className="p-6 rounded-lg border border-dashed border-border bg-card text-center">
                    <Icons.Upload />
                    <p className="mt-2 text-sm text-muted-foreground">Drag & drop or click to upload</p>
                    <input
                      type="file"
                      accept="audio/*"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload">
                      <Button variant="outline" className="mt-4" asChild>
                        <span>Choose Files</span>
                      </Button>
                    </label>
              </div>
                </div>

                {/* File List */}
                {cloneFiles.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Selected Files ({cloneFiles.length}/5)</label>
                    {cloneFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-card border">
                        <span className="text-sm truncate">{file.name}</span>
                        <button onClick={() => removeFile(index)} className="text-destructive hover:text-destructive/80">
                          <Icons.Trash />
                        </button>
                      </div>
                    ))}
              </div>
                )}

                {/* Clone Button */}
                <Button 
                  onClick={cloneVoice} 
                  disabled={cloneLoading || !cloneName.trim() || cloneFiles.length === 0}
                  className="w-full"
                  size="lg"
                >
                  <Icons.Mic />
                  <span className="ml-2">{cloneLoading ? 'Cloning...' : 'Clone Voice'}</span>
                </Button>
            </CardContent>
          </Card>
        </div>
        )}

        {/* ============ CONVERSATION TAB ============ */}
        {activeTab === 'conversation' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icons.MessageCircle />
                  Conversation Generator
                </CardTitle>
                <CardDescription>
                  Create multi-speaker dialogues with different voices
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {conversationMessages.map((msg, index) => (
                  <div key={msg.id} className="p-4 rounded-lg border bg-card space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={msg.speaker}
                        onChange={(e) => updateConversationMessage(msg.id, 'speaker', e.target.value)}
                        placeholder="Speaker name"
                        className="flex-1 px-3 py-2 rounded-lg border bg-background text-sm"
                      />
                      {conversationMessages.length > 1 && (
                        <button
                          onClick={() => removeConversationMessage(msg.id)}
                          className="text-destructive hover:text-destructive/80"
                        >
                          <Icons.Trash />
                        </button>
                      )}
                    </div>
                    <select
                      value={msg.voiceId}
                      onChange={(e) => updateConversationMessage(msg.id, 'voiceId', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
                    >
                      <option value="">Select voice...</option>
                      {voices.map(v => (
                        <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                      ))}
                    </select>
                    <textarea
                      value={msg.text}
                      onChange={(e) => updateConversationMessage(msg.id, 'text', e.target.value)}
                      placeholder="What does this speaker say?"
                      className="w-full px-3 py-2 rounded-lg border bg-background text-sm resize-none"
                      rows={2}
                    />
                  </div>
                ))}

                <button
                  onClick={addConversationMessage}
                  className="w-full p-3 rounded-lg border border-dashed border-border hover:border-primary text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-2"
                >
                  <Icons.Plus />
                  Add Speaker
                </button>

                {conversationError && (
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                    {conversationError}
                  </div>
                )}

                  <Button
                  className="w-full" 
                  size="lg" 
                  onClick={generateConversation}
                  disabled={conversationLoading}
                >
                  <Icons.Play />
                  <span className="ml-2">{conversationLoading ? 'Generating...' : 'Generate Conversation'}</span>
                  </Button>

                {/* Generated Audio Results */}
                {conversationAudios.length > 0 && (
                  <div className="space-y-3 pt-4 border-t">
                    <h4 className="font-medium flex items-center gap-2">
                      <Icons.Volume2 />
                      Generated Conversation
                    </h4>
                    {conversationAudios.map((url, index) => {
                      const msg = conversationMessages.filter(m => m.text.trim() && m.voiceId)[index]
                      return (
                        <div key={index} className="p-3 rounded-lg bg-card border">
                          <p className="text-sm text-muted-foreground mb-2">
                            {msg?.speaker || `Speaker ${index + 1}`}: "{msg?.text?.substring(0, 50)}..."
                          </p>
                          <audio src={url} controls className="w-full" />
                        </div>
                      )
                    })}
                </div>
                )}
              </CardContent>
            </Card>
          </div>
          )}

        {/* ============ COMPARE TAB ============ */}
        {activeTab === 'compare' && (
          <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icons.Layers />
                  Voice Comparison
                </CardTitle>
                <CardDescription>
                  Compare how different voices sound with the same text
                </CardDescription>
            </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <label className="text-sm font-medium mb-2 block">Comparison Text</label>
                  <textarea
                    value={compareText}
                    onChange={(e) => setCompareText(e.target.value)}
                    placeholder="Enter text to compare across voices..."
                    className="w-full px-4 py-3 rounded-lg border bg-background resize-none"
                    rows={4}
                    maxLength={500}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Voice A */}
                  <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
                    <label className="text-sm font-medium mb-2 block">Voice A</label>
                    <select
                      value={compareVoice1}
                      onChange={(e) => setCompareVoice1(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border bg-background text-sm mb-3"
                    >
                      <option value="">Select voice...</option>
                      {voices.map(v => (
                        <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                      ))}
                    </select>
                    <Button onClick={() => generateCompare(1)} className="w-full mb-3" disabled={compareLoading1}>
                      {compareLoading1 ? 'Generating...' : 'Generate A'}
                    </Button>
                    {compareAudio1 && <audio src={compareAudio1} controls className="w-full" />}
                  </div>

                  {/* Voice B */}
                  <div className="p-4 rounded-lg border border-secondary/30 bg-secondary/5">
                    <label className="text-sm font-medium mb-2 block">Voice B</label>
                    <select
                      value={compareVoice2}
                      onChange={(e) => setCompareVoice2(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border bg-background text-sm mb-3"
                    >
                      <option value="">Select voice...</option>
                      {voices.map(v => (
                        <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                      ))}
                    </select>
                    <Button onClick={() => generateCompare(2)} variant="secondary" className="w-full mb-3" disabled={compareLoading2}>
                      {compareLoading2 ? 'Generating...' : 'Generate B'}
                    </Button>
                    {compareAudio2 && <audio src={compareAudio2} controls className="w-full" />}
                  </div>
                </div>

                {/* Generate Both Button */}
                <Button 
                  onClick={async () => {
                    await Promise.all([generateCompare(1), generateCompare(2)])
                  }} 
                  className="w-full mt-4" 
                  size="lg"
                  disabled={compareLoading1 || compareLoading2 || !compareVoice1 || !compareVoice2 || !compareText.trim()}
                >
                  <Icons.Play />
                  <span className="ml-2">
                    {(compareLoading1 || compareLoading2) ? 'Generating...' : 'Generate Both & Compare'}
                  </span>
                </Button>
            </CardContent>
          </Card>
        </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2026 NextEleven LLC. All Rights Reserved.</p>
          <p className="text-xs mt-1">100% Self-Hosted • No External APIs • Full Privacy</p>
      </div>
      </footer>
    </div>
  )
}
