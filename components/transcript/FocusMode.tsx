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
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-[#222] text-[#888] hover:text-[#f5f5f5] hover:bg-[#333] transition-colors"
        title="Close (ESC)"
      >
        <X size={20} />
      </button>

      {/* ESC hint */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[10px] text-[#444]">
        ESC to close
      </div>

      {/* Entries */}
      <div className="w-full max-w-3xl px-8 flex flex-col items-center gap-6">
        {recent.length === 0 ? (
          <p className="text-[#444] text-lg">전사 내용이 없습니다</p>
        ) : (
          recent.map((entry, i) => {
            const isLast = i === recent.length - 1
            const opacity = i === 0 ? 'opacity-30' : i === 1 ? 'opacity-60' : 'opacity-100'
            const size = isLast ? 'text-4xl font-light' : 'text-lg'

            return (
              <div key={entry.id} className={`text-center ${opacity} transition-all`}>
                <div className="text-[#888] text-xs mb-1 font-mono">
                  [{entry.timestamp}] {entry.channelName.split(' ')[0]}
                </div>
                <div className={`text-white leading-relaxed ${size}`}>
                  {entry.text}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Status badge */}
      <div className="absolute bottom-8">
        <StatusBadge status={status} />
      </div>
    </div>
  )
}
