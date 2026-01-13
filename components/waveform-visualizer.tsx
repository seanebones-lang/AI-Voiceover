"use client"

import { useEffect, useRef, useState } from 'react'
import { BarChart, Bar, ResponsiveContainer } from 'recharts'

interface WaveformVisualizerProps {
  audioUrl: string
}

export function WaveformVisualizer({ audioUrl }: WaveformVisualizerProps) {
  const [waveformData, setWaveformData] = useState<number[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  useEffect(() => {
    if (!audioUrl) return

    const audio = new Audio(audioUrl)
    let animationFrameId: number

    const setupAudio = async () => {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        const analyser = audioContext.createAnalyser()
        const source = audioContext.createMediaElementSource(audio)

        analyser.fftSize = 256
        source.connect(analyser)
        analyser.connect(audioContext.destination)

        audioContextRef.current = audioContext
        analyserRef.current = analyser

        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)

        const updateWaveform = () => {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray)
            
            // Downsample to 20 bars for visualization
            const bars = 20
            const step = Math.floor(bufferLength / bars)
            const waveform = []
            
            for (let i = 0; i < bars; i++) {
              const index = i * step
              waveform.push(dataArray[index] / 255)
            }
            
            setWaveformData(waveform)
          }
          
          if (!audio.paused && !audio.ended) {
            animationFrameId = requestAnimationFrame(updateWaveform)
          }
        }

        audio.addEventListener('play', () => {
          updateWaveform()
        })

        audio.addEventListener('pause', () => {
          cancelAnimationFrame(animationFrameId)
        })

        audio.addEventListener('ended', () => {
          cancelAnimationFrame(animationFrameId)
          setWaveformData(new Array(20).fill(0))
        })
      } catch (error) {
        console.error('Failed to setup audio visualization:', error)
      }
    }

    setupAudio()

    return () => {
      cancelAnimationFrame(animationFrameId)
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [audioUrl])

  // Generate chart data
  const chartData = waveformData.map((value, index) => ({
    name: index.toString(),
    value: value * 100,
  }))

  if (chartData.length === 0) {
    // Show static bars when no audio
    chartData.push(...new Array(20).fill(0).map((_, i) => ({
      name: i.toString(),
      value: 10,
    })))
  }

  return (
    <div className="h-20 w-full">
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
}
