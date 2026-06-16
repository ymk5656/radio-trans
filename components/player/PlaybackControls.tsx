'use client'
import {
  SkipBack,
  Play,
  Pause,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useState } from 'react'

interface PlaybackControlsProps {
  isPlaying: boolean
  volume: number
  onPlayPause: () => void
  onVolumeChange: (vol: number) => void
  onPrev?: () => void
  onNext?: () => void
}

export function PlaybackControls({
  isPlaying,
  volume,
  onPlayPause,
  onVolumeChange,
  onPrev,
  onNext,
}: PlaybackControlsProps) {
  const [isMuted, setIsMuted] = useState(false)
  const [prevVolume, setPrevVolume] = useState(1)

  const handleMuteToggle = () => {
    if (isMuted) {
      setIsMuted(false)
      onVolumeChange(prevVolume)
    } else {
      setPrevVolume(volume)
      setIsMuted(true)
      onVolumeChange(0)
    }
  }

  const btnCls =
    'p-2 rounded-lg text-[#909090] hover:text-[#f0f0f0] hover:bg-white/[0.06] transition-all duration-150 active:scale-90'

  return (
    <div className="flex items-center gap-3">
      <button className={btnCls} onClick={onPrev} title="Previous">
        <SkipBack size={15} />
      </button>
      <button
        className={`
          p-3 rounded-full bg-green-500 hover:bg-green-400 text-black
          transition-all duration-200 active:scale-90
          ${isPlaying
            ? 'shadow-[0_0_24px_rgba(34,197,94,0.45),0_4px_12px_rgba(0,0,0,0.4)]'
            : 'shadow-[0_4px_14px_rgba(0,0,0,0.5)]'
          }
        `}
        onClick={onPlayPause}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={17} fill="black" /> : <Play size={17} fill="black" />}
      </button>
      <button className={btnCls} onClick={onNext} title="Next">
        <SkipForward size={15} />
      </button>

      <div className="flex items-center gap-2 ml-1">
        <button
          className="p-1.5 text-[#909090] hover:text-[#f0f0f0] transition-colors active:scale-90"
          onClick={handleMuteToggle}
        >
          {isMuted || volume === 0 ? (
            <VolumeX size={14} />
          ) : (
            <Volume2 size={14} />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={isMuted ? 0 : volume}
          onChange={e => {
            const v = parseFloat(e.target.value)
            if (isMuted && v > 0) setIsMuted(false)
            onVolumeChange(v)
          }}
          className="w-20"
        />
      </div>
    </div>
  )
}
