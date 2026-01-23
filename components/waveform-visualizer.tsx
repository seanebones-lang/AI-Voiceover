"use client"

/**
 * WaveformVisualizer Component
 * Displays real-time audio waveform visualization
 * 
 * @param audioUrl - URL of the audio file to visualize
 */
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { BarChart, Bar, ResponsiveContainer } from 'recharts'
import { useAudioContext } from '@/hooks/useAudioContext'

interface WaveformVisualizerProps {
  audioUrl: string
  'aria-label'?: string
}

export const WaveformVisualizer = React.memo(function WaveformVisualizer({ 
  audioUrl,
  'aria-label': ariaLabel = 'Audio waveform visualization'
}: WaveformVisualizerProps) {
  const [waveformData, setWaveformData] = useState<number[]>([])
  const audioContextRef = useAudioContext()
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const updateWaveform = useCallback(() => {
    if (!analyserRef.current) return

    const bufferLength = analyserRef.current.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyserRef.current.getByteFrequencyData(dataArray)
    
    // Downsample to 20 bars for visualization
    const bars = 20
    const step = Math.floor(bufferLength / bars)
    const waveform: number[] = []
    
    for (let i = 0; i < bars; i++) {
      const index = i * step
      waveform.push(dataArray[index] / 255)
    }
    
    setWaveformData(waveform)
    
    if (audioRef.current && !audioRef.current.paused && !audioRef.current.ended) {
      animationFrameRef.current = requestAnimationFrame(updateWaveform)
    }
  }, [])

  useEffect(() => {
    if (!audioUrl || !audioContextRef.current) return

    const audio = new Audio(audioUrl)
    audioRef.current = audio

    const setupAudio = async () => {
      try {
        if (!audioContextRef.current) return

        const analyser = audioContextRef.current.createAnalyser()
        const source = audioContextRef.current.createMediaElementSource(audio)

        analyser.fftSize = 256
        source.connect(analyser)
        analyser.connect(audioContextRef.current.destination)

        analyserRef.current = analyser

        const handlePlay = () => {
          updateWaveform()
        }

        const handlePause = () => {
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
            animationFrameRef.current = null
          }
        }

        const handleEnded = () => {
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
            animationFrameRef.current = null
          }
          setWaveformData(new Array(20).fill(0))
        }

        audio.addEventListener('play', handlePlay)
        audio.addEventListener('pause', handlePause)
        audio.addEventListener('ended', handleEnded)

        return () => {
          audio.removeEventListener('play', handlePlay)
          audio.removeEventListener('pause', handlePause)
          audio.removeEventListener('ended', handleEnded)
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
          }
        }
      } catch (error) {
        console.error('Failed to setup audio visualization:', error)
      }
    }

    const cleanup = setupAudio()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      cleanup?.then(cleanupFn => cleanupFn?.())
    }
  }, [audioUrl, audioContextRef, updateWaveform])

  // Memoize chart data generation
  const chartData = useMemo(() => {
    if (waveformData.length === 0) {
      // Show static bars when no audio
      return new Array(20).fill(0).map((_, i) => ({
        name: i.toString(),
        value: 10,
      }))
    }

    return waveformData.map((value, index) => ({
      name: index.toString(),
      value: value * 100,
    }))
  }, [waveformData])

  return (
    <div className="h-20 w-full" aria-label={ariaLabel} role="img">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <Bar
            dataKey="value"
            fill="url(#colorGradient)"
            radius={[4, 4, 0, 0]}
          />
          <defs>
            <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
})
