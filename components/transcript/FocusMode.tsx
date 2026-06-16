'use client'
import { useEffect, useRef, useCallback } from 'react'
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)

  // ESC key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Auto-follow the latest line, but only while the user is parked near the
  // bottom — so they can freely scroll up through history without being yanked.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !isAtBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [entries])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }, [])

  return (
    // Tap the backdrop to close. The scrollable entry list stops propagation so
    // scrolling/tapping inside it never accidentally closes focus mode.
    <div
      className="fixed inset-0 z-50 bg-black/97 backdrop-blur-md flex flex-col"
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

      {/* Entries — scrollable history, latest emphasized at the bottom */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onClick={(e) => e.stopPropagation()}
        className="relative flex-1 w-full overflow-y-auto"
      >
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[#383838] text-xl font-light">No transcription yet</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-10 flex flex-col items-center gap-8 pt-24 pb-32">
            {entries.map((entry, i) => {
              const isLast = i === entries.length - 1
              const size = isLast
                ? 'text-[38px] font-light tracking-tight leading-tight'
                : 'text-2xl font-light'

              return (
                <div
                  key={entry.id}
                  className={`text-center transition-all duration-500 ${isLast ? 'opacity-100' : 'opacity-60'}`}
                >
                  <div className="text-[#484848] text-[10px] mb-2.5 font-mono tracking-[0.12em] uppercase">
                    {entry.timestamp} · {entry.channelName.split(' ')[0]}
                  </div>
                  <div className={`text-white leading-relaxed ${size}`}>
                    {entry.text}
                  </div>
                  {entry.translation && (
                    <div className="text-blue-400/60 text-xl font-light italic mt-3 leading-relaxed">
                      {entry.translation}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Status badge — bottom center */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none">
        <StatusBadge status={status} />
      </div>
    </div>
  )
}
