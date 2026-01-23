"use client"

/**
 * WaveformVisualizer Component
 * Lightweight audio waveform visualization (no recharts ~200KB).
 * Uses CSS-based bars for LCP/INP-friendly rendering.
 */
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useAudioContext } from '@/hooks/useAudioContext'

interface WaveformVisualizerProps {
  audioUrl: string
  'aria-label'?: string
}

const BAR_COUNT = 20

export const WaveformVisualizer = React.memo(function WaveformVisualizer({
  audioUrl,
  'aria-label': ariaLabel = 'Audio waveform visualization',
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

    const step = Math.floor(bufferLength / BAR_COUNT)
    const waveform: number[] = []
    for (let i = 0; i < BAR_COUNT; i++) {
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
          setWaveformData(new Array(BAR_COUNT).fill(0))
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
      cleanup?.then((cleanupFn) => cleanupFn?.())
    }
  }, [audioUrl, audioContextRef, updateWaveform])

  const barHeights = useMemo(() => {
    if (waveformData.length === 0) {
      return new Array(BAR_COUNT).fill(10)
    }
    return waveformData.map((v) => Math.max(4, v * 100))
  }, [waveformData])

  if (!audioUrl) return null

  return (
    <div
      className="flex items-end justify-between gap-0.5 h-20 w-full"
      style={{ minHeight: 80 }}
      aria-label={ariaLabel}
      role="img"
    >
      {barHeights.map((height, i) => (
        <div
          key={i}
          className="flex-1 min-w-[2px] rounded-t transition-[height] duration-75 ease-out bg-gradient-to-t from-indigo-500 to-violet-500"
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  )
})
