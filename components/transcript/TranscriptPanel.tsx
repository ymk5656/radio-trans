'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { ClipboardCopy, Maximize2 } from 'lucide-react'
import { TranscriptEntry, saveTranscripts } from '@/lib/storage'
import { TranscribeStatus } from '@/hooks/useTranscription'
import { TranscriptEntryRow } from './TranscriptEntry'
import { TranscriptSearch } from './TranscriptSearch'
import { FocusMode } from './FocusMode'

interface TranscriptPanelProps {
  entries: TranscriptEntry[]
  status: TranscribeStatus
}

export function TranscriptPanel({ entries, status }: TranscriptPanelProps) {
  const [search, setSearch] = useState('')
  const [fontSize, setFontSize] = useState(13)
  const [focusMode, setFocusMode] = useState(false)
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !isAtBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [entries])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    isAtBottomRef.current = atBottom
  }, [])

  const handleCopy = () => {
    const text = entries.map(e => `[${e.timestamp}] ${e.channelName}: ${e.text}`).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const filtered = search.trim()
    ? entries.filter(e => e.text.toLowerCase().includes(search.toLowerCase()))
    : entries

  return (
    <div className="w-full h-full bg-[#262626] border-l border-[#404040] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#404040] flex-shrink-0">
        <span className="text-xs font-semibold text-[#e8e8e8] tracking-wide">
          Transcription Feed
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 rounded text-[#909090] hover:text-[#f0f0f0] hover:bg-[#323232] transition-colors"
            title="Copy all"
          >
            <ClipboardCopy size={13} />
          </button>
          {copied && (
            <span className="text-[10px] text-green-400">Copied!</span>
          )}
          <button
            onClick={() => setFocusMode(true)}
            className="p-1 rounded text-[#909090] hover:text-[#f0f0f0] hover:bg-[#323232] transition-colors"
            title="Focus Mode"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      <TranscriptSearch
        value={search}
        fontSize={fontSize}
        onChange={setSearch}
        onFontSizeChange={setFontSize}
        onSave={() => saveTranscripts(entries)}
      />

      {/* Entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#707070] text-xs gap-2">
            {entries.length === 0 ? (
              <>
                <div className="text-2xl">🎙</div>
                <p className="text-[#909090]">전사 내용이 없습니다</p>
                <p className="text-[10px] text-[#606060]">TRANSCRIBE 버튼을 눌러 시작하세요</p>
              </>
            ) : (
              <p>검색 결과 없음</p>
            )}
          </div>
        ) : (
          filtered.map((entry, i) => (
            <TranscriptEntryRow
              key={entry.id}
              entry={entry}
              isLatest={i === filtered.length - 1}
              fontSize={fontSize}
              searchTerm={search}
            />
          ))
        )}
      </div>

      {entries.length > 0 && (
        <div className="px-3 py-1 border-t border-[#404040] flex-shrink-0">
          <span className="text-[10px] text-[#707070]">
            {entries.length}개 항목
            {entries.length >= 500 && ' (최대 500개)'}
          </span>
        </div>
      )}

      {focusMode && (
        <FocusMode
          entries={entries}
          status={status}
          onClose={() => setFocusMode(false)}
        />
      )}
    </div>
  )
}
