"use client"

import { useEffect, useRef, useCallback } from 'react'

interface AudioVisualizerProps {
  audioUrl: string | null
  isPlaying?: boolean
  variant?: 'bars' | 'wave' | 'circle'
  color?: string
  height?: number
}

export function AudioVisualizer({ 
  audioUrl, 
  isPlaying = false,
  variant = 'bars',
  color = '#22c55e',
  height = 80
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyser.getByteFrequencyData(dataArray)

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (variant === 'bars') {
      const barCount = 32
      const barWidth = canvas.width / barCount - 2
      const step = Math.floor(bufferLength / barCount)

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i * step] / 255
        const barHeight = value * canvas.height * 0.9

        // Gradient color based on height
        const hue = 142 + (i / barCount) * 30 // Green to teal
        ctx.fillStyle = `hsla(${hue}, 70%, ${45 + value * 20}%, ${0.7 + value * 0.3})`
        
        const x = i * (barWidth + 2)
        const y = canvas.height - barHeight
        
        // Rounded bars
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, 3)
        ctx.fill()
      }
    } else if (variant === 'wave') {
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = 2

      const sliceWidth = canvas.width / bufferLength
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0
        const y = (v * canvas.height) / 2

        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
        x += sliceWidth
      }

      ctx.lineTo(canvas.width, canvas.height / 2)
      ctx.stroke()
    } else if (variant === 'circle') {
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      const radius = Math.min(centerX, centerY) * 0.6

      for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i] / 255
        const angle = (i / bufferLength) * Math.PI * 2
        const r = radius + value * radius * 0.5

        const x = centerX + Math.cos(angle) * r
        const y = centerY + Math.sin(angle) * r

        ctx.beginPath()
        ctx.arc(x, y, 2 + value * 3, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(142, 70%, ${50 + value * 30}%, ${0.5 + value * 0.5})`
        ctx.fill()
      }
    }

    animationRef.current = requestAnimationFrame(draw)
  }, [variant, color])

  const drawIdle = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (variant === 'bars') {
      const barCount = 32
      const barWidth = canvas.width / barCount - 2

      for (let i = 0; i < barCount; i++) {
        const idleHeight = 4 + Math.sin(Date.now() / 500 + i * 0.3) * 3
        ctx.fillStyle = 'hsla(142, 70%, 45%, 0.3)'
        
        const x = i * (barWidth + 2)
        const y = canvas.height - idleHeight
        
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, idleHeight, 2)
        ctx.fill()
      }
    }

    if (!isPlaying) {
      animationRef.current = requestAnimationFrame(drawIdle)
    }
  }, [variant, isPlaying])

  useEffect(() => {
    if (!audioUrl) {
      drawIdle()
      return
    }

    // Cleanup previous audio context
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }

    const setupAudio = async () => {
      try {
        const audio = new Audio(audioUrl)
        audioRef.current = audio

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8

        const source = audioContext.createMediaElementSource(audio)
        source.connect(analyser)
        analyser.connect(audioContext.destination)

        audioContextRef.current = audioContext
        analyserRef.current = analyser
        sourceRef.current = source

        audio.addEventListener('play', () => {
          cancelAnimationFrame(animationRef.current)
          draw()
        })

        audio.addEventListener('pause', () => {
          cancelAnimationFrame(animationRef.current)
          drawIdle()
        })

        audio.addEventListener('ended', () => {
          cancelAnimationFrame(animationRef.current)
          drawIdle()
        })

      } catch (error) {
        console.error('Audio visualization setup failed:', error)
        drawIdle()
      }
    }

    setupAudio()

    return () => {
      cancelAnimationFrame(animationRef.current)
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [audioUrl, draw, drawIdle])

  useEffect(() => {
    if (!audioUrl) {
      drawIdle()
    }
  }, [audioUrl, drawIdle])

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={height}
      className="w-full rounded-lg bg-black/20"
      style={{ height: `${height}px` }}
    />
  )
}
