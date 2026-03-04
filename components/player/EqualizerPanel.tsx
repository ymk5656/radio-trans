'use client'
import { useState, useCallback } from 'react'
import { RotateCcw } from 'lucide-react'
import { EQ_BANDS } from '@/hooks/useAudioEngine'

interface EqualizerPanelProps {
  initialGains: number[]
  onBandChange: (bandIndex: number, gainDb: number) => void
  onReset: () => void
  onGainsChange: (gains: number[]) => void  // called whenever gains change (for persistence)
}

const PRESETS: Record<string, number[]> = {
  Flat:           [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost':   [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
  'Treble Boost': [0, 0, 0, 0, 0, 0, 2, 4, 6, 8],
  Speech:         [-2, -1, 0, 2, 4, 4, 3, 2, 1, 0],
  'Bass Cut':     [-6, -4, -2, 0, 0, 0, 0, 0, 0, 0],
}

export function EqualizerPanel({ initialGains, onBandChange, onReset, onGainsChange }: EqualizerPanelProps) {
  const [gains, setGains] = useState<number[]>(() => [...initialGains])
  const [activePreset, setActivePreset] = useState(() => {
    // Detect if initial gains match a preset
    const flat = initialGains.every(g => g === 0)
    if (flat) return 'Flat'
    for (const [name, preset] of Object.entries(PRESETS)) {
      if (preset.every((v, i) => v === initialGains[i])) return name
    }
    return ''
  })

  const handleSlider = useCallback((index: number, raw: string) => {
    // range input gives 0..240, map to +12..-12
    const sliderVal = parseInt(raw, 10)
    const gainDb = 12 - (sliderVal / 240) * 24
    const rounded = Math.round(gainDb * 10) / 10
    setGains(prev => {
      const next = [...prev]
      next[index] = rounded
      onGainsChange(next)
      return next
    })
    setActivePreset('')
    onBandChange(index, rounded)
  }, [onBandChange, onGainsChange])

  const applyPreset = useCallback((name: string) => {
    const preset = PRESETS[name]
    if (!preset) return
    setGains([...preset])
    setActivePreset(name)
    preset.forEach((db, i) => onBandChange(i, db))
    onGainsChange([...preset])
  }, [onBandChange, onGainsChange])

  const handleReset = useCallback(() => {
    const zeros = new Array(EQ_BANDS.length).fill(0)
    setGains(zeros)
    setActivePreset('Flat')
    onReset()
    onGainsChange(zeros)
  }, [onReset, onGainsChange])

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Presets */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {Object.keys(PRESETS).map(name => (
          <button
            key={name}
            onClick={() => applyPreset(name)}
            className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
              activePreset === name
                ? 'bg-green-500/20 border-green-500/60 text-green-400'
                : 'bg-[#2a2a2a] border-[#505050] text-[#909090] hover:text-[#d0d0d0]'
            }`}
          >
            {name}
          </button>
        ))}
        <button
          onClick={handleReset}
          className="ml-auto flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border border-[#505050] text-[#909090] hover:text-[#d0d0d0] transition-colors"
        >
          <RotateCcw size={9} />
          Reset
        </button>
      </div>

      {/* Sliders */}
      <div className="flex items-end justify-between gap-1">
        {EQ_BANDS.map((band, i) => {
          const gain = gains[i]
          const sliderVal = Math.round(((12 - gain) / 24) * 240)
          return (
            <div key={band.freq} className="flex flex-col items-center gap-1 flex-1">
              {/* dB label */}
              <span className={`text-[9px] font-mono tabular-nums ${
                gain > 0 ? 'text-green-400' : gain < 0 ? 'text-orange-400' : 'text-[#606060]'
              }`}>
                {gain > 0 ? `+${gain}` : gain}
              </span>

              {/* Vertical slider track */}
              <div className="relative h-28 flex items-center justify-center">
                <input
                  type="range"
                  min={0}
                  max={240}
                  value={sliderVal}
                  onChange={e => handleSlider(i, e.target.value)}
                  className="eq-slider"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl', width: '20px', height: '112px' }}
                />
                {/* Center marker line */}
                <div className="absolute w-3 h-px bg-[#404040] pointer-events-none" style={{ top: '50%' }} />
              </div>

              {/* Frequency label */}
              <span className="text-[9px] text-[#707070]">{band.short}</span>
            </div>
          )
        })}
      </div>

      {/* dB scale labels */}
      <div className="flex justify-between px-1 text-[8px] text-[#505050]">
        <span>+12</span>
        <span>0</span>
        <span>-12</span>
      </div>
    </div>
  )
}
