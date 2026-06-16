'use client'
import { useEffect } from 'react'
import { X } from 'lucide-react'
import { TranscriptEntry } from '@/lib/storage'
import { TranscribeStatus } from '@/hooks/useTranscription'
import { StatusBadge } from '../player/StatusBadge'

interface FocusModeProps {
  entries: TranscriptEntry[]
  status: TranscribeStatus
  onClose: () => void
}

export function FocusMode({ entries, status, onClose }: FocusModeProps) {
  // ESC key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const recent = entries.slice(-3)

  return (
    // Tap anywhere on the backdrop to close — guarantees an exit even if the
    // small X is hard to hit (esp. on touch screens).
    <div
      className="fixed inset-0 z-50 bg-black/97 backdrop-blur-md flex flex-col items-center justify-center"
      onClick={onClose}
    >
      {/* Ambient radial glow at bottom */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_100%,rgba(34,197,94,0.06)_0%,transparent_70%)] pointer-events-none" />

      {/* Close button — large hit area, sits above everything */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 flex items-center justify-center w-11 h-11 rounded-full bg-white/[0.06] text-[#999] hover:text-white hover:bg-white/[0.12] transition-all duration-150 active:scale-90"
        title="Close (ESC)"
        aria-label="Close focus mode"
      >
        <X size={22} />
      </button>

      {/* ESC hint */}
      <div className="absolute top-7 left-1/2 -translate-x-1/2 text-[10px] text-[#333] tracking-[0.15em] uppercase select-none pointer-events-none">
        ESC or tap to close
      </div>

      {/* Entries */}
      <div className="w-full max-w-3xl px-10 flex flex-col items-center gap-8 -translate-y-24">
        {recent.length === 0 ? (
          <p className="text-[#383838] text-xl font-light">No transcription yet</p>
        ) : (
          recent.map((entry, i) => {
            const isLast = i === recent.length - 1
            const opacity = i === 0 ? 'opacity-[0.22]' : i === 1 ? 'opacity-[0.5]' : 'opacity-100'
            const size = isLast ? 'text-[38px] font-light tracking-tight leading-tight' : 'text-xl font-light'

            return (
              <div key={entry.id} className={`text-center ${opacity} transition-all duration-500`}>
                <div className="text-[#484848] text-[10px] mb-2.5 font-mono tracking-[0.12em] uppercase">
                  {entry.timestamp} · {entry.channelName.split(' ')[0]}
                </div>
                <div className={`text-white leading-relaxed ${size}`}>
                  {entry.text}
                </div>
                {isLast && entry.translation && (
                  <div className="text-blue-400/60 text-xl font-light italic mt-3 leading-relaxed">
                    {entry.translation}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Status badge — bottom center */}
      <div className="absolute bottom-8">
        <StatusBadge status={status} />
      </div>
    </div>
  )
}
