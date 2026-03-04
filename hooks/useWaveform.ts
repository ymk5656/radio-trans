'use client'
import { useRef, useCallback, useEffect } from 'react'

export function useWaveform(
  analyserRef: React.RefObject<AnalyserNode | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  isActive: boolean
) {
  const rafRef = useRef<number | null>(null)
  const isRunningRef = useRef(false)

  const drawFrame = useCallback(() => {
    const analyser = analyserRef.current
    const canvas = canvasRef.current
    if (!analyser || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const bars = 48
    const step = Math.floor(data.length / bars)
    const gap = 2
    const barW = canvas.width / bars - gap

    ctx.fillStyle = '#22c55e'

    for (let i = 0; i < bars; i++) {
      const value = data[i * step] / 255
      const h = Math.max(4, value * canvas.height * 0.9)
      const x = i * (barW + gap)
      const y = (canvas.height - h) / 2
      ctx.globalAlpha = 0.3 + value * 0.7
      ctx.fillRect(x, y, barW, h)
    }
    ctx.globalAlpha = 1

    if (isRunningRef.current) {
      rafRef.current = requestAnimationFrame(drawFrame)
    }
  }, [analyserRef, canvasRef])

  const start = useCallback(() => {
    if (isRunningRef.current) return
    isRunningRef.current = true
    rafRef.current = requestAnimationFrame(drawFrame)
  }, [drawFrame])

  const stop = useCallback(() => {
    isRunningRef.current = false
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    // Clear canvas
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [canvasRef])

  useEffect(() => {
    if (isActive) {
      start()
    } else {
      stop()
    }
    return () => {
      stop()
    }
  }, [isActive, start, stop])
}
