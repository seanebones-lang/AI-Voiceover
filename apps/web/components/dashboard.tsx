"use client"

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Wand2, Volume2, Download, Mic, Upload, Trash2, Plus, Play, Square,
  MessageCircle, Layers, AlertCircle, Check, X, Copy, CircleHelp,
} from 'lucide-react'
import {
  VOICE_CLONE_CALIBRATION_SCRIPT,
  CLONE_RECORDING_CHECKLIST,
  CLONE_MULTI_SAMPLE_RECOMMENDATION,
  CLONE_SUGGESTED_PARAGRAPHS,
} from '@/lib/clone-calibration'
import { CLONED_TTS_MAX_CHARS, STANDARD_TTS_MAX_CHARS } from '@/lib/validation'
import { EMOTIONS } from '@/lib/constants/emotions'

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

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export function Dashboard() {
  // Active tab
  const [activeTab, setActiveTab] = useState<TabType>('tts')
  
  // TTS State
  const [text, setText] = useState('')
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [voices, setVoices] = useState<Voice[]>([])
  const [voicesDegraded, setVoicesDegraded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const generateSpeechRef = useRef<() => Promise<void> | void>(() => {})
  const downloadAudioRef = useRef<() => void>(() => {})
  const objectUrlsRef = useRef<Set<string>>(new Set())
  const [speed, setSpeed] = useState([1.0])
  const [pitch, setPitch] = useState([0])
  const [volume, setVolume] = useState([1.0])

  function registerObjectUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob)
    objectUrlsRef.current.add(url)
    return url
  }

  function revokeObjectUrl(url: string | null | undefined) {
    if (!url) return
    if (objectUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url)
      objectUrlsRef.current.delete(url)
    }
  }

  // Audio Effects State
  const [reverb, setReverb] = useState([0])
  const [echo, setEcho] = useState([0])
  const [noiseReduction, setNoiseReduction] = useState(false)
  const [showEffects, setShowEffects] = useState(true) // Show by default now
  
  // Special Effects
  const [specialEffect, setSpecialEffect] = useState<string>('none')
  /** Server-side prosody preset (merged with speed/pitch sliders). */
  const [ttsEmotion, setTtsEmotion] = useState<string>('neutral')
  
  // Advanced Settings
  const [outputFormat, setOutputFormat] = useState<'mp3' | 'wav'>('mp3')
  const [autoTrimSilence, setAutoTrimSilence] = useState(true)
  const [addBreathing, setAddBreathing] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 })
  const [batchAudios, setBatchAudios] = useState<string[]>([])
  
  // Presets
  const [savedPresets, setSavedPresets] = useState<Array<{
    id: string
    name: string
    voiceId: string
    speed: number
    pitch: number
    volume: number
    reverb: number
    echo: number
    effect: string
  }>>([])
  
  // Stats
  const [totalGenerations, setTotalGenerations] = useState(0)
  const [totalCharacters, setTotalCharacters] = useState(0)
  
  // Language
  const [language, setLanguage] = useState('en')
  
  // Auto-save text to localStorage
  useEffect(() => {
    const saved = localStorage.getItem('nexteleven_draft')
    if (saved) setText(saved)
  }, [])
  
  useEffect(() => {
    if (text) localStorage.setItem('nexteleven_draft', text)
  }, [text])
  
  // Load presets from localStorage
  useEffect(() => {
    const presets = localStorage.getItem('nexteleven_presets')
    const parsedPresets = safeJsonParse<typeof savedPresets>(presets)
    if (parsedPresets && Array.isArray(parsedPresets)) {
      setSavedPresets(parsedPresets)
    }
    
    const stats = localStorage.getItem('nexteleven_stats')
    const parsedStats = safeJsonParse<{ gens?: number; chars?: number }>(stats)
    if (parsedStats) {
      setTotalGenerations(parsedStats.gens || 0)
      setTotalCharacters(parsedStats.chars || 0)
    }
  }, [])

  useEffect(() => {
    const trackedUrls = objectUrlsRef.current
    return () => {
      trackedUrls.forEach((url) => URL.revokeObjectURL(url))
      trackedUrls.clear()
    }
  }, [])

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
  const [capabilities, setCapabilities] = useState<{ tts_default?: boolean; tts_xai?: boolean; cloning?: boolean } | null>(null)
  
  // Check service health (with timeout so UI never hangs)
  useEffect(() => {
    const HEALTH_TIMEOUT_MS = 8000
    const checkHealth = async () => {
      try {
        const controller = new AbortController()
        const id = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
        const res = await fetch('/api/health', { signal: controller.signal })
        clearTimeout(id)
        const data = await res.json()
        if (data.status === 'healthy' || data.status === 'ok') {
          setServiceHealth('healthy')
        } else if (data.status === 'degraded') {
          setServiceHealth('degraded')
        } else {
          setServiceHealth('offline')
        }
        if (data.capabilities) setCapabilities(data.capabilities)
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
        generateSpeechRef.current()
      }
      // Ctrl/Cmd + D to download
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && audioUrl) {
        e.preventDefault()
        downloadAudioRef.current()
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
  const [cloneQualityWarnings, setCloneQualityWarnings] = useState<string[]>([])
  const [cloneRecommendations, setCloneRecommendations] = useState<string[]>([])
  const [cloneTips, setCloneTips] = useState<string[]>([])
  const [calibrationCopied, setCalibrationCopied] = useState(false)
  const [cloneQualityTier, setCloneQualityTier] = useState<string | null>(null)
  /** Coqui XTTS v2 clone output character (cloned voices only). */
  const [cloneVoicePreset, setCloneVoicePreset] = useState<'natural' | 'expressive' | 'stable'>('natural')
  const [showCloneAdvanced, setShowCloneAdvanced] = useState(false)
  const [cloneTemperature, setCloneTemperature] = useState([0.63])
  const [cloneRepetitionPenalty, setCloneRepetitionPenalty] = useState([1.68])
  const [cloneTopK, setCloneTopK] = useState([50])
  const [cloneTopP, setCloneTopP] = useState([0.9])
  const [autoExpressive, setAutoExpressive] = useState(true)
  const [expressiveIntensity, setExpressiveIntensity] = useState<'subtle' | 'balanced' | 'dramatic'>('subtle')
  const [showCloneCoach, setShowCloneCoach] = useState(true)
  const [cloneScriptId, setCloneScriptId] = useState<string>(CLONE_SUGGESTED_PARAGRAPHS[0]?.id ?? 'neutral_narration')
  const [isRecording, setIsRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  useEffect(() => {
    if (!recordedBlob) {
      setRecordedBlobUrl(null)
      return
    }
    const url = registerObjectUrl(recordedBlob)
    setRecordedBlobUrl(url)
    return () => revokeObjectUrl(url)
  }, [recordedBlob])

  function getCloneTuningPayload(voiceId: string) {
    if (!voiceId.startsWith('clone_')) return {}
    return {
      clone_preset: cloneVoicePreset,
      temperature: cloneTemperature[0],
      repetition_penalty: cloneRepetitionPenalty[0],
      top_k: cloneTopK[0],
      top_p: cloneTopP[0],
      auto_expressive: autoExpressive,
      expressive_intensity: expressiveIntensity,
    }
  }

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

  /** After async TTS, <audio autoPlay> often fails in production (CSP / autoplay policy). media-src blob: + programmatic play fixes playback. */
  useLayoutEffect(() => {
    if (!audioUrl) return
    const el = audioRef.current
    if (!el) return
    void el.play().catch(() => {
      /* Autoplay blocked or not ready — native controls still work */
    })
  }, [audioUrl])

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
          emotion: ttsEmotion,
          speed: 1.0,
          pitch: 0,
          volume: 1.0,
          ...getCloneTuningPayload(voiceId),
        }),
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Preview failed (${response.status})`)
      }
      const blob = await response.blob()
      const url = registerObjectUrl(blob)
      const audio = new Audio(url)
      previewAudioRef.current = audio
      audio.play()
      audio.onended = () => revokeObjectUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function loadVoices() {
    const VOICES_TIMEOUT_MS = 8000
    try {
      const controller = new AbortController()
      const id = setTimeout(() => controller.abort(), VOICES_TIMEOUT_MS)
      const response = await fetch('/api/voices', { signal: controller.signal })
      clearTimeout(id)
      const data = await response.json()
      setVoices(data.voices || [])
      setVoicesDegraded(!!data.degraded)
      if (data.voices?.length > 0) {
        setSelectedVoice(data.voices[0].voice_id)
      }
    } catch (err) {
      console.error('Failed to load voices:', err)
      setVoicesDegraded(true)
      // Fallback so UI is still usable when API is slow or XTTS is down
      const fallback = [
        { voice_id: 'default_english', name: 'Guy (US English)', language: 'en', source: 'edge-tts' },
        { voice_id: 'female_english', name: 'Jenny (US English)', language: 'en', source: 'edge-tts' },
      ]
      setVoices(fallback)
      setSelectedVoice('default_english')
    }
  }

  // ============ TTS Functions ============
  async function generateSpeech() {
    if (!text.trim() || !selectedVoice) {
      setError('Please enter text and select a voice')
      return
    }
    
    // Batch mode - split by paragraphs
    if (batchMode) {
      const paragraphs = text.split(/\n\n+/).filter(p => p.trim())
      if (paragraphs.length > 1) {
        await generateBatch(paragraphs)
        return
      }
    }

    setLoading(true)
    revokeObjectUrl(audioUrl)
    setAudioUrl(null)
    setAudioBlob(null)
    setAudioError(null)
    setError(null)

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          voice_id: selectedVoice,
          language,
          emotion: ttsEmotion,
          speed: speed[0],
          pitch: pitch[0],
          volume: volume[0],
          reverb: reverb[0],
          echo: echo[0],
          noise_reduction: noiseReduction,
          special_effect: specialEffect,
          ...getCloneTuningPayload(selectedVoice),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        const parts = [
          errorData?.error,
          errorData?.details,
          errorData?.hint,
          errorData?.requestId ? `(requestId: ${errorData.requestId})` : null,
        ]
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .join(' ')
        throw new Error(parts || `Generation failed (${response.status})`)
      }

      const contentType = response.headers.get('content-type') || 'audio/mpeg'
      const rawBlob = await response.blob()

      // Re-wrap blob with explicit MIME type to ensure browser can decode it
      const blob = new Blob([rawBlob], { type: contentType })

      if (blob.size === 0) {
        throw new Error('Server returned empty audio data')
      }

      revokeObjectUrl(audioUrl)
      const url = registerObjectUrl(blob)
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
      
      // Update stats
      const newGens = totalGenerations + 1
      const newChars = totalCharacters + text.trim().length
      setTotalGenerations(newGens)
      setTotalCharacters(newChars)
      localStorage.setItem('nexteleven_stats', JSON.stringify({ gens: newGens, chars: newChars }))
      
      // Clear draft after successful generation
      localStorage.removeItem('nexteleven_draft')
    } catch (err) {
      console.error('Generation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate speech')
    } finally {
      setLoading(false)
    }
  }

  function downloadAudio() {
    if (!audioBlob) return
    const url = registerObjectUrl(audioBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nexteleven-${Date.now()}.${outputFormat}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    revokeObjectUrl(url)
  }

  generateSpeechRef.current = generateSpeech
  downloadAudioRef.current = downloadAudio

  // ============ Preset Functions ============
  function saveCurrentAsPreset() {
    const name = prompt('Enter preset name:')
    if (!name) return
    
    const newPreset = {
      id: Date.now().toString(),
      name,
      voiceId: selectedVoice,
      speed: speed[0],
      pitch: pitch[0],
      volume: volume[0],
      reverb: reverb[0],
      echo: echo[0],
      effect: specialEffect
    }
    
    const updated = [...savedPresets, newPreset]
    setSavedPresets(updated)
    localStorage.setItem('nexteleven_presets', JSON.stringify(updated))
  }
  
  function loadPreset(preset: typeof savedPresets[0]) {
    setSelectedVoice(preset.voiceId)
    setSpeed([preset.speed])
    setPitch([preset.pitch])
    setVolume([preset.volume])
    setReverb([preset.reverb])
    setEcho([preset.echo])
    setSpecialEffect(preset.effect)
  }
  
  function deletePreset(id: string) {
    const updated = savedPresets.filter(p => p.id !== id)
    setSavedPresets(updated)
    localStorage.setItem('nexteleven_presets', JSON.stringify(updated))
  }
  
  // ============ Batch Generation ============
  async function generateBatch(paragraphs: string[]) {
    setLoading(true)
    batchAudios.forEach((url) => revokeObjectUrl(url))
    setBatchAudios([])
    setBatchProgress({ current: 0, total: paragraphs.length })
    setError(null)
    
    const audios: string[] = []
    
    for (let i = 0; i < paragraphs.length; i++) {
      setBatchProgress({ current: i + 1, total: paragraphs.length })
      
      try {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: paragraphs[i].trim(),
            voice_id: selectedVoice,
            language,
            emotion: ttsEmotion,
            speed: speed[0],
            pitch: pitch[0],
            volume: volume[0],
            reverb: reverb[0],
            echo: echo[0],
            noise_reduction: noiseReduction,
            special_effect: specialEffect,
            ...getCloneTuningPayload(selectedVoice),
          }),
        })
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Generation failed (${response.status})`)
        }
        const blob = await response.blob()
        const url = registerObjectUrl(blob)
        audios.push(url)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setError(`Paragraph ${i + 1} failed: ${msg}`)
        break
      }
    }

    setBatchAudios(audios)
    setLoading(false)
    
    // Update stats
    const totalChars = paragraphs.reduce((sum, p) => sum + p.length, 0)
    const newGens = totalGenerations + paragraphs.length
    const newChars = totalCharacters + totalChars
    setTotalGenerations(newGens)
    setTotalCharacters(newChars)
    localStorage.setItem('nexteleven_stats', JSON.stringify({ gens: newGens, chars: newChars }))
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

  async function copyCloneScript(textToCopy: string) {
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCloneError(null)
      setCalibrationCopied(true)
      window.setTimeout(() => setCalibrationCopied(false), 2000)
    } catch {
      setCloneError('Could not copy script — select the text manually or allow clipboard access.')
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
    setCloneTips([])
    setCloneQualityTier(null)
    setCloneQualityWarnings([])
    setCloneRecommendations([])

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

      setCloneSuccess(data.message || `Voice "${cloneName}" cloned successfully!`)
      setCloneQualityWarnings(data.quality_warnings || [])
      setCloneRecommendations(data.recommendations || [])
      setCloneTips(Array.isArray(data.clone_tips) ? data.clone_tips : [])
      setCloneQualityTier(typeof data.quality_tier === 'string' ? data.quality_tier : null)
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
    conversationAudios.forEach((url) => revokeObjectUrl(url))
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
            language,
            emotion: ttsEmotion,
            ...getCloneTuningPayload(msg.voiceId),
          }),
        })

        if (!response.ok) {
          throw new Error(`Failed to generate audio for ${msg.speaker || 'speaker'}`)
        }

        const blob = await response.blob()
        const url = registerObjectUrl(blob)
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
        body: JSON.stringify({
          text: compareText.trim(),
          voice_id: voiceId,
          emotion: ttsEmotion,
          ...getCloneTuningPayload(voiceId),
        }),
      })

      if (!response.ok) throw new Error('Generation failed')

      const blob = await response.blob()
      const targetUrl = voiceNum === 1 ? compareAudio1 : compareAudio2
      revokeObjectUrl(targetUrl)
      const url = registerObjectUrl(blob)
      
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
                <Volume2 className="h-5 w-5" />
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
              {capabilities && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Standard {capabilities.tts_default ? '✓' : '—'} · xAI {capabilities.tts_xai ? '✓' : '—'} · Cloning {capabilities.cloning ? '✓' : '—'}
                </span>
              )}
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
              { id: 'tts' as TabType, label: 'Text to Speech', icon: Wand2 },
              { id: 'clone' as TabType, label: 'Clone Voice', icon: Mic },
              { id: 'conversation' as TabType, label: 'Conversation', icon: MessageCircle },
              { id: 'compare' as TabType, label: 'Compare', icon: Layers },
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
              <AlertCircle className="h-5 w-5" />
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
              <X className="h-4 w-4" />
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
              {/* Creator workflow presets: one-click speed/pitch/effects for pro-reading and short-form */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground mr-2 self-center">Workflow:</span>
                {[
                  { label: 'Pro Reading', speed: 0.95, pitch: 0, effect: 'none' },
                  { label: 'TikTok Hook', speed: 1.15, pitch: 0, effect: 'none' },
                  { label: 'TikTok Story', speed: 1.05, pitch: 0, effect: 'none' },
                ].map(p => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setSpeed([p.speed])
                      setPitch([p.pitch])
                      setSpecialEffect(p.effect)
                    }}
                    className="px-2.5 py-1 text-xs rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              
              {/* Voice Selection */}
              <div>
                {voicesDegraded && (
                  <p className="text-amber-600 dark:text-amber-400 text-sm mb-2" role="status">
                    Cloned voices temporarily unavailable. Standard voices are still available.
                  </p>
                )}
                <label className="text-sm font-medium mb-2 block">Select Voice</label>
                <div className="flex gap-2">
                  <select
                  value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-lg border bg-background"
                  >
                      <option value="">Select a voice...</option>
                      {voices.filter(v => v.source === 'cloned').length > 0 && (
                        <optgroup label="Cloned Voices">
                          {voices.filter(v => v.source === 'cloned').map(v => (
                            <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                          ))}
                        </optgroup>
                      )}
                    <optgroup label="Standard Voices">
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
                      <Play className="h-5 w-5" />
                    )}
                  </Button>
                </div>
                {selectedVoice.startsWith('clone_') && (
                  <div className="mt-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <label className="text-sm font-medium">Clone delivery (XTTS v2)</label>
                      <CircleHelp
                        className="h-4 w-4 text-muted-foreground"
                        title="Natural keeps identity tight, Stable is safest for long narration, Expressive adds style but can drift identity."
                      />
                    </div>
                    <select
                      value={cloneVoicePreset}
                      onChange={(e) =>
                        setCloneVoicePreset(e.target.value as 'natural' | 'expressive' | 'stable')
                      }
                      className="w-full px-4 py-3 rounded-lg border bg-background"
                    >
                      <option value="natural">Natural — balanced warmth and consistency</option>
                      <option value="expressive">Expressive — more variation (character reads)</option>
                      <option value="stable">Stable — tighter, uniform narration</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Tuned sampling for your cloned voice. Try Natural first; switch if the read feels too flat or too wild.
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Identity-first workflow: Natural or Stable + subtle expressive mode.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowCloneAdvanced(!showCloneAdvanced)}
                      className="text-xs text-primary hover:underline mt-2"
                    >
                      {showCloneAdvanced ? 'Hide advanced clone controls' : 'Show advanced clone controls'}
                    </button>
                    {showCloneAdvanced && (
                      <div className="mt-3 space-y-3 rounded-lg border p-3 bg-card">
                        <div>
                          <div className="flex justify-between mb-1">
                            <label className="text-xs font-medium">Temperature</label>
                            <span className="text-xs text-muted-foreground">{cloneTemperature[0].toFixed(2)}</span>
                          </div>
                          <Slider value={cloneTemperature} onValueChange={setCloneTemperature} min={0.35} max={1.15} step={0.01} />
                        </div>
                        <div>
                          <div className="flex justify-between mb-1">
                            <label className="text-xs font-medium">Repetition Penalty</label>
                            <span className="text-xs text-muted-foreground">{cloneRepetitionPenalty[0].toFixed(2)}</span>
                          </div>
                          <Slider value={cloneRepetitionPenalty} onValueChange={setCloneRepetitionPenalty} min={1.0} max={2.5} step={0.01} />
                        </div>
                        <div>
                          <div className="flex justify-between mb-1">
                            <label className="text-xs font-medium">Top-K</label>
                            <span className="text-xs text-muted-foreground">{Math.round(cloneTopK[0])}</span>
                          </div>
                          <Slider value={cloneTopK} onValueChange={setCloneTopK} min={10} max={100} step={1} />
                        </div>
                        <div>
                          <div className="flex justify-between mb-1">
                            <label className="text-xs font-medium">Top-P</label>
                            <span className="text-xs text-muted-foreground">{cloneTopP[0].toFixed(2)}</span>
                          </div>
                          <Slider value={cloneTopP} onValueChange={setCloneTopP} min={0.65} max={0.99} step={0.01} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Language Selector */}
              <div>
                <label className="text-sm font-medium mb-2 block">Language</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { code: 'en', label: 'English' },
                    { code: 'es', label: 'Spanish' },
                    { code: 'fr', label: 'French' },
                    { code: 'de', label: 'German' },
                    { code: 'it', label: 'Italian' },
                    { code: 'pt', label: 'Portuguese' },
                    { code: 'ja', label: 'Japanese' },
                    { code: 'ko', label: 'Korean' },
                    { code: 'zh', label: 'Chinese' },
                  ].map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => setLanguage(lang.code)}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                        language === lang.code
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary hover:bg-secondary/80'
                      }`}
                    >
                      {lang.code.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Emotion</label>
                <p className="text-xs text-muted-foreground mb-2">
                  Shapes delivery on the server (speed, pitch, light reverb/levels). Works with cloned and standard voices.
                </p>
                <div className="flex flex-wrap gap-2">
                  {EMOTIONS.map((emo) => (
                    <button
                      key={emo.id}
                      type="button"
                      onClick={() => setTtsEmotion(emo.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                        ttsEmotion === emo.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary hover:bg-secondary/80'
                      }`}
                    >
                      <span className="mr-1" aria-hidden>
                        {emo.emoji}
                      </span>
                      {emo.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border p-3 bg-card/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <label className="text-sm font-medium">Auto expressive from punctuation</label>
                    <CircleHelp
                      className="h-4 w-4 text-muted-foreground"
                      title="Uses ! ? ... and dashes to shape delivery automatically. Keep subtle for clone identity."
                    />
                  </div>
                  <input
                    type="checkbox"
                    checked={autoExpressive}
                    onChange={(e) => setAutoExpressive(e.target.checked)}
                    className="w-4 h-4 rounded border-input bg-background"
                  />
                </div>
                {autoExpressive && (
                  <div>
                    <label className="text-xs font-medium mb-2 block">Expressive intensity</label>
                    <div className="flex gap-2">
                      {(['subtle', 'balanced', 'dramatic'] as const).map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setExpressiveIntensity(level)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs capitalize ${
                            expressiveIntensity === level
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary hover:bg-secondary/80'
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                    {selectedVoice.startsWith('clone_') && expressiveIntensity === 'dramatic' && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                        Dramatic mode can reduce clone identity match. Prefer subtle for person-like realism.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Text Input */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Your Text</label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={batchMode}
                        onChange={(e) => setBatchMode(e.target.checked)}
                        className="w-3 h-3"
                      />
                      <span className="text-muted-foreground">Batch mode</span>
                  </label>
                    <span
                      className={`text-xs ${
                        selectedVoice.startsWith('clone_') && charCount > CLONED_TTS_MAX_CHARS
                          ? 'text-destructive font-medium'
                          : selectedVoice.startsWith('clone_') && charCount > CLONED_TTS_MAX_CHARS * 0.85
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {charCount}
                      {selectedVoice.startsWith('clone_') ? ` / ${CLONED_TTS_MAX_CHARS}` : ''} chars • {wordCount} words
                    </span>
                  </div>
                </div>
                {selectedVoice.startsWith('clone_') && (
                  <p className="text-xs text-muted-foreground mb-2">
                    Cloned voices: up to {CLONED_TTS_MAX_CHARS} characters per generation (one XTTS run). For longer scripts, enable batch mode and keep each paragraph under that limit.
                  </p>
                )}
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={batchMode 
                    ? "Type or paste your text here...\n\nSeparate paragraphs with blank lines for batch processing." 
                    : "Type or paste your text here..."
                  }
                  className="w-full min-h-[200px] px-4 py-3 rounded-lg border bg-background resize-none"
                  maxLength={selectedVoice.startsWith('clone_') ? CLONED_TTS_MAX_CHARS : STANDARD_TTS_MAX_CHARS}
                />
                {batchMode && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Batch mode: {text.split(/\n\n+/).filter(p => p.trim()).length} paragraphs detected
                    {selectedVoice.startsWith('clone_')
                      ? ' — each paragraph must stay within the clone character limit.'
                      : ''}
                  </p>
                )}
              </div>
              
              {/* Batch Results */}
              {batchAudios.length > 0 && (
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    Batch Results ({batchAudios.length} clips)
                  </h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {batchAudios.map((url, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-6">{i + 1}.</span>
                        <audio src={url} controls className="flex-1 h-8" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                    <span className="ml-2">
                      {batchProgress.total > 0 
                        ? `Processing ${batchProgress.current}/${batchProgress.total}...` 
                        : 'Generating...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Wand2 className="h-5 w-5" />
                    <span className="ml-2">
                      {batchMode && text.split(/\n\n+/).filter(p => p.trim()).length > 1
                        ? `Generate ${text.split(/\n\n+/).filter(p => p.trim()).length} Clips`
                        : 'Generate Voice-Over'}
                    </span>
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
                          <label className="text-sm font-medium mb-3 block">Special Effect</label>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { id: 'none', label: 'None' },
                              { id: 'robot', label: 'Robot' },
                              { id: 'radio', label: 'Radio' },
                              { id: 'whisper', label: 'Whisper' },
                              { id: 'deep', label: 'Deep' },
                              { id: 'chipmunk', label: 'Chipmunk' },
                              { id: 'cave', label: 'Cave' },
                              { id: 'telephone', label: 'Phone' },
                              { id: 'underwater', label: 'Underwater' },
                              { id: 'megaphone', label: 'Megaphone' },
                            ].map(effect => (
                              <button
                                key={effect.id}
                                onClick={() => setSpecialEffect(effect.id)}
                                className={`p-2.5 rounded-lg text-xs font-medium transition-all ${
                                  specialEffect === effect.id
                                    ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background'
                                    : 'bg-secondary hover:bg-secondary/80'
                                }`}
                              >
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
              <Card className={audioUrl ? "border-primary/30 bg-primary/5" : ""}>
              <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Volume2 className="h-5 w-5" />
                  Generated Audio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary mr-2" />
                    Generating audio...
                  </div>
                ) : audioUrl ? (
                  <>
                    <audio
                      ref={audioRef}
                      key={audioUrl}
                      src={audioUrl}
                      controls
                      playsInline
                      preload="auto"
                      className="w-full"
                      onError={(e) => {
                        const code = e.currentTarget.error?.code
                        const hints: Record<number, string> = {
                          1: 'Playback was interrupted.',
                          2: 'Network error while loading audio.',
                          3: 'Decode failed — response may not be valid audio (wrong Content-Type or corrupt data).',
                          4: 'This format is not supported in your browser.',
                        }
                        const hint = code ? hints[code] ?? `(code ${code})` : ''
                        setAudioError(
                          [
                            'Browser could not play this audio.',
                            hint,
                            'Try downloading instead; if the file opens elsewhere, check XTTS/Edge TTS output and response headers.',
                          ]
                            .filter(Boolean)
                            .join(' ')
                        )
                      }}
                      onLoadedData={() => setAudioError(null)}
                    />
                    {audioError && (
                      <p className="text-xs text-yellow-500">{audioError}</p>
                    )}
                  </>
                ) : (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    Enter text and click generate to create audio
                  </div>
                )}
                <div className="flex gap-2">
                      <Button onClick={downloadAudio} variant="outline" className="flex-1" disabled={!audioBlob}>
                        <Download className="h-5 w-5" />
                        <span className="ml-2">Download</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                        disabled={!audioBlob}
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

              {/* Stats Card */}
              <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-primary">{totalGenerations}</div>
                      <div className="text-xs text-muted-foreground">Generations</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-primary">{totalCharacters.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">Characters</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Presets Card */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Saved Presets</CardTitle>
                    <button
                      onClick={saveCurrentAsPreset}
                      disabled={!selectedVoice}
                      className="text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      + Save Current
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  {savedPresets.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      No presets saved yet.<br/>Configure your voice settings and click &quot;Save Current&quot;
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {savedPresets.map(preset => (
                        <div 
                          key={preset.id}
                          className="group flex items-center justify-between p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                        >
                          <button
                            onClick={() => loadPreset(preset)}
                            className="flex-1 text-left text-sm font-medium truncate"
                          >
                            {preset.name}
                          </button>
                          <button
                            onClick={() => deletePreset(preset.id)}
                            className="opacity-0 group-hover:opacity-100 text-destructive text-xs ml-2"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

          <Card>
            <CardHeader>
                  <CardTitle className="text-sm">About</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>Powered by <strong>Microsoft Edge TTS</strong> + <strong>xAI Grok</strong></p>
                  <p>Standard voices free. xAI voices require XAI_API_KEY.</p>
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
                            const url = registerObjectUrl(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = `nexteleven-history-${new Date().toISOString().slice(0,10)}.json`
                            a.click()
                            revokeObjectUrl(url)
                          }}
                          className="text-xs text-muted-foreground hover:text-primary transition-colors"
                          title="Export history"
                        >
                          Export
                        </button>
                        <button 
                          onClick={() => {
                            history.forEach((item) => revokeObjectUrl(item.audioUrl))
                            setHistory([])
                          }}
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
                  <Mic className="h-5 w-5" />
                  Voice Clone Studio
                </CardTitle>
              <CardDescription>
                Studio-grade cloning with Coqui XTTS v2: quiet room, one speaker, 30–120 seconds of clear speech beats long noisy recordings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-foreground">Clone quality coach</p>
                    <button
                      type="button"
                      onClick={() => setShowCloneCoach(!showCloneCoach)}
                      className="text-xs text-primary hover:underline"
                    >
                      {showCloneCoach ? 'Hide details' : 'Show details'}
                    </button>
                  </div>
                  <p className="text-xs">
                    {CLONE_MULTI_SAMPLE_RECOMMENDATION.bestRange} {CLONE_MULTI_SAMPLE_RECOMMENDATION.why}
                  </p>
                  {showCloneCoach && (
                    <>
                      <ul className="list-disc list-inside text-xs space-y-1">
                        {CLONE_RECORDING_CHECKLIST.map((tip) => (
                          <li key={tip}>{tip}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-muted-foreground">
                        {CLONE_MULTI_SAMPLE_RECOMMENDATION.perSample}
                      </p>
                    </>
                  )}
                </div>
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">Suggested scripts</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const selected = CLONE_SUGGESTED_PARAGRAPHS.find((s) => s.id === cloneScriptId)
                        copyCloneScript(selected?.text ?? VOICE_CLONE_CALIBRATION_SCRIPT)
                      }}
                      className="gap-1.5"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {calibrationCopied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <select
                    value={cloneScriptId}
                    onChange={(e) => setCloneScriptId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
                  >
                    {CLONE_SUGGESTED_PARAGRAPHS.map((script) => (
                      <option key={script.id} value={script.id}>
                        {script.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Read one script per take. For best identity lock, record 2-4 takes with slightly different pacing and emphasis.
                  </p>
                  <p className="text-sm leading-relaxed text-foreground/90 whitespace-normal border-l-2 border-primary/40 pl-3">
                    {CLONE_SUGGESTED_PARAGRAPHS.find((script) => script.id === cloneScriptId)?.text || VOICE_CLONE_CALIBRATION_SCRIPT}
                  </p>
                </div>
                {/* Success/Error Messages */}
                {cloneSuccess && (
                  <div className="p-4 rounded-lg bg-primary/10 border border-primary/30 text-primary space-y-2">
                    <div className="flex items-center gap-2">
                      <Check className="h-5 w-5" />
                      <span className="font-medium">{cloneSuccess}</span>
                    </div>
                    {cloneQualityWarnings.length > 0 && (
                      <div className="text-sm text-yellow-500 mt-2">
                        <p className="font-medium">Quality Notes:</p>
                        <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
                          {cloneQualityWarnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}
                    {cloneRecommendations.length > 0 && (
                      <div className="text-sm text-muted-foreground mt-2">
                        <p className="font-medium">Tips for better results:</p>
                        <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
                          {cloneRecommendations.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                    {cloneQualityTier && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Reference quality tier: <span className="text-foreground font-medium">{cloneQualityTier}</span>
                        {cloneQualityTier === 'minimal' || cloneQualityTier === 'basic'
                          ? ' — add more clear audio for richer clones.'
                          : null}
                      </p>
                    )}
                    {cloneTips.length > 0 && (
                      <div className="text-sm text-muted-foreground mt-2">
                        <p className="font-medium">NextEleven clone guide:</p>
                        <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
                          {cloneTips.map((t, i) => <li key={i}>{t}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {cloneError && (
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
                    {cloneError}
                  </div>
                )}
                {cloneFiles.length === 1 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300">
                    One sample uploaded. Quality is usually better with 2-4 clean samples covering neutral, expressive, and question cadence.
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
                        {isRecording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                      </button>
                      <p className="text-sm text-muted-foreground">
                        {isRecording ? 'Recording... Click to stop' : 'Click to start recording'}
                      </p>
                      {recordedBlob && recordedBlobUrl && (
                        <div className="w-full space-y-2">
                          <audio src={recordedBlobUrl} controls className="w-full" />
                          <Button onClick={addRecordingToFiles} variant="outline" className="w-full">
                            <Plus className="h-5 w-5" />
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
                    <Upload className="h-5 w-5" />
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
                          <Trash2 className="h-4 w-4" />
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
                  <Mic className="h-5 w-5" />
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
                  <MessageCircle className="h-5 w-5" />
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
                          <Trash2 className="h-4 w-4" />
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
                  <Plus className="h-5 w-5" />
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
                  <Play className="h-5 w-5" />
                  <span className="ml-2">{conversationLoading ? 'Generating...' : 'Generate Conversation'}</span>
                  </Button>

                {/* Generated Audio Results */}
                {conversationAudios.length > 0 && (
                  <div className="space-y-3 pt-4 border-t">
                    <h4 className="font-medium flex items-center gap-2">
                      <Volume2 className="h-5 w-5" />
                      Generated Conversation
                    </h4>
                    {conversationAudios.map((url, index) => {
                      const msg = conversationMessages.filter(m => m.text.trim() && m.voiceId)[index]
                      return (
                        <div key={index} className="p-3 rounded-lg bg-card border">
                          <p className="text-sm text-muted-foreground mb-2">
                            {msg?.speaker || `Speaker ${index + 1}`}: &quot;{msg?.text?.substring(0, 50)}...&quot;
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
                  <Layers className="h-5 w-5" />
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
                  <Play className="h-5 w-5" />
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
          <p className="text-xs mt-1">Edge TTS • xAI Grok Voices • Voice Cloning</p>
      </div>
      </footer>
    </div>
  )
}
