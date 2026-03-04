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
    'p-1.5 rounded text-[#b0b0b0] hover:text-[#f0f0f0] hover:bg-[#323232] transition-colors'

  return (
    <div className="flex items-center gap-2">
      <button className={btnCls} onClick={onPrev} title="Previous">
        <SkipBack size={16} />
      </button>
      <button
        className="p-2 rounded-full bg-green-500 hover:bg-green-400 text-black transition-colors"
        onClick={onPlayPause}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={16} fill="black" /> : <Play size={16} fill="black" />}
      </button>
      <button className={btnCls} onClick={onNext} title="Next">
        <SkipForward size={16} />
      </button>

      <div className="flex items-center gap-2 ml-2">
        <button className={btnCls} onClick={handleMuteToggle}>
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
          className="w-20 h-1 accent-green-500"
        />
      </div>
    </div>
  )
}
