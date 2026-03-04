'use client'
import { useRef, useEffect } from 'react'
import { useWaveform } from '@/hooks/useWaveform'

interface WaveformCanvasProps {
  analyserRef: React.RefObject<AnalyserNode | null>
  isActive: boolean
}

export function WaveformCanvas({ analyserRef, isActive }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useWaveform(analyserRef, canvasRef, isActive)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      const ctx = canvas.getContext('2d')
      ctx?.scale(window.devicePixelRatio, window.devicePixelRatio)
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="relative w-full h-[120px] bg-[#1e1e1e] rounded-lg overflow-hidden border border-[#404040]">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            'linear-gradient(#22c55e 1px, transparent 1px), linear-gradient(90deg, #22c55e 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: 'pixelated' }}
      />
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-end gap-0.5 h-8">
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                className="w-1 bg-green-500/30 rounded-sm"
                style={{
                  height: `${20 + Math.sin(i * 0.5) * 15}%`,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
