'use client'
import { TranscriptEntry as TEntry } from '@/lib/storage'

interface TranscriptEntryProps {
  entry: TEntry
  isLatest: boolean
  fontSize: number
  // Station name is only shown when it differs from the previous entry, so it
  // appears once at the top of each station's run instead of on every line.
  showChannel: boolean
}

export function TranscriptEntryRow({
  entry,
  isLatest,
  fontSize,
  showChannel,
}: TranscriptEntryProps) {
  return (
    <div
      className={`
        px-3 py-2.5 border-b border-[#2e2e2e]
        transition-colors duration-150 hover:bg-white/[0.02]
        ${isLatest
          ? 'border-l-2 border-l-green-500 bg-green-500/[0.05] entry-appear'
          : 'border-l-2 border-l-transparent'
        }
      `}
    >
      {/* Header: timestamp + (channel only when it changes) */}
      <div className="flex items-baseline gap-1.5 mb-0.5">
        <span
          className="text-[#4a4a4a] font-mono tabular-nums flex-shrink-0"
          style={{ fontSize: fontSize * 0.78 }}
        >
          {entry.timestamp}
        </span>
        {showChannel && (
          <span
            className="text-green-500/80 font-semibold flex-shrink-0"
            style={{ fontSize: fontSize * 0.82 }}
          >
            {entry.channelName.split(' ')[0]}
          </span>
        )}
      </div>

      {/* Transcript text */}
      <span className="text-[#ddd] leading-relaxed" style={{ fontSize }}>
        {entry.text}
      </span>

      {/* Korean translation */}
      {entry.translation && (
        <div
          className="mt-1.5 pl-2.5 border-l border-blue-500/30 text-blue-300/70 italic leading-relaxed"
          style={{ fontSize: fontSize * 0.92 }}
        >
          {entry.translation}
        </div>
      )}
    </div>
  )
}
