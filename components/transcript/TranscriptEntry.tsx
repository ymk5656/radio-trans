'use client'
import { TranscriptEntry as TEntry } from '@/lib/storage'

interface TranscriptEntryProps {
  entry: TEntry
  isLatest: boolean
  fontSize: number
  searchTerm: string
}

function highlight(text: string, term: string): React.ReactNode {
  if (!term.trim()) return text
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-300 text-black rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  )
}

export function TranscriptEntryRow({
  entry,
  isLatest,
  fontSize,
  searchTerm,
}: TranscriptEntryProps) {
  return (
    <div
      className={`px-3 py-2 border-b border-[#363636] transition-colors hover:bg-[#2e2e2e] ${
        isLatest ? 'border-l-2 border-l-green-500 bg-green-950/20' : ''
      }`}
    >
      {/* Original transcript line */}
      <div>
        <span className="text-[#808080] font-mono" style={{ fontSize: fontSize * 0.85 }}>
          [{entry.timestamp}]{' '}
        </span>
        <span className="text-green-400 font-semibold" style={{ fontSize: fontSize * 0.85 }}>
          {entry.channelName.split(' ')[0]}:{' '}
        </span>
        <span className="text-[#e8e8e8]" style={{ fontSize }}>
          {highlight(entry.text, searchTerm)}
        </span>
      </div>

      {/* Korean translation (shown when present) */}
      {entry.translation && (
        <div
          className="mt-1 pl-2 border-l-2 border-blue-500/40 text-[#88aacc] italic"
          style={{ fontSize: fontSize * 0.92 }}
        >
          {highlight(entry.translation, searchTerm)}
        </div>
      )}
    </div>
  )
}
