'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { ClipboardCopy, Maximize2, Mic, Globe, Save, SlidersHorizontal } from 'lucide-react'
import { TranscriptEntry, saveTranscripts } from '@/lib/storage'
import { TranscribeStatus } from '@/hooks/useTranscription'
import { TranscriptEntryRow } from './TranscriptEntry'
import { FocusMode } from './FocusMode'

interface TranscriptPanelProps {
  entries: TranscriptEntry[]
  status: TranscribeStatus
  isTranslating: boolean
  onTranslateToggle: () => void
  // Snap speaker delay to the latest measured latency (동조). Lives in Player;
  // bridged through Home so the button can sit atop the transcript.
  onSyncNow: () => void
  // True while a transcription session is active — gates the 동조 button.
  syncActive: boolean
  // Return to the player/equalizer screen (mobile single-panel layout).
  onBackToPlayer: () => void
}

export function TranscriptPanel({ entries, status, isTranslating, onTranslateToggle, onSyncNow, syncActive, onBackToPlayer }: TranscriptPanelProps) {
  const [fontSize, setFontSize] = useState(13)
  const [focusMode, setFocusMode] = useState(false)
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const lastAutoScrollAt = useRef(0)

  // Auto-follow: when the user is parked near the bottom, keep the view pinned
  // to the latest line as new entries arrive or the font size reflows content.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !isAtBottomRef.current) return
    lastAutoScrollAt.current = performance.now()
    el.scrollTop = el.scrollHeight
  }, [entries, fontSize])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    // Ignore scroll events fired right after a programmatic auto-scroll. Rapid
    // entry arrival can grow scrollHeight between our scrollTop set and the
    // event firing, which would otherwise mis-flag the user as scrolled-up and
    // freeze auto-follow. A time window (vs. a boolean flag) can never get
    // stuck, so manual scrolls always register once it expires.
    if (performance.now() - lastAutoScrollAt.current < 150) return
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }, [])

  const handleCopy = () => {
    const text = entries.map(e => `[${e.timestamp}] ${e.channelName}: ${e.text}`).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="w-full h-full bg-[#262626] border-l border-[#383838] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#383838] flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Back to player/equalizer — mobile only (desktop shows both panels) */}
          <button
            onClick={onBackToPlayer}
            className="md:hidden p-1.5 -ml-1 rounded-lg text-[#909090] hover:text-[#f0f0f0] hover:bg-white/[0.06] transition-all duration-150 active:scale-90"
            title="이퀄라이저 화면으로"
            aria-label="이퀄라이저 화면으로 돌아가기"
          >
            <SlidersHorizontal size={14} />
          </button>
          <span className="text-xs font-semibold text-[#d8d8d8] tracking-wide">Transcription</span>
          {/* Live dot — shown when actively receiving */}
          {(status === 'receiving' || status === 'transcribing') && (
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {status === 'transcribing' ? 'AI' : 'Live'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {/* 번역 toggle — placed above the output so translation can be
              turned on/off at transcription time */}
          <button
            onClick={onTranslateToggle}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all duration-150 active:scale-90 ${
              isTranslating
                ? 'bg-blue-500/20 text-blue-300'
                : 'text-[#707070] hover:text-[#f0f0f0] hover:bg-white/[0.06]'
            }`}
            title={isTranslating ? '번역 켜짐' : '번역 꺼짐'}
          >
            <Globe size={12} />
            번역
          </button>
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg text-[#707070] hover:text-[#f0f0f0] hover:bg-white/[0.06] transition-all duration-150 active:scale-90"
            title="Copy all"
          >
            <ClipboardCopy size={12} />
          </button>
          {copied && (
            <span className="text-[10px] text-green-400 pr-1">Copied!</span>
          )}
          <button
            onClick={() => setFocusMode(true)}
            className="p-1.5 rounded-lg text-[#707070] hover:text-[#f0f0f0] hover:bg-white/[0.06] transition-all duration-150 active:scale-90"
            title="Focus Mode"
          >
            <Maximize2 size={12} />
          </button>
        </div>
      </div>

      {/* Toolbar — 동조 (sync) replaces the old search bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#404040]">
        <button
          onClick={onSyncNow}
          disabled={!syncActive}
          title={syncActive ? '지금 측정된 지연으로 동조' : '전사 중에만 동조할 수 있습니다'}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-bold transition-all duration-150 ${
            syncActive
              ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30 active:scale-[0.98]'
              : 'bg-[#323232] text-[#5a5a5a] cursor-not-allowed'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${syncActive ? 'bg-green-400 animate-pulse' : 'bg-[#555]'}`} />
          동조
        </button>
        <button
          title="Font size"
          onClick={() => setFontSize(fontSize >= 24 ? 14 : fontSize + 2)}
          className="p-1 rounded text-[#909090] hover:text-[#f0f0f0] hover:bg-[#323232] transition-colors text-xs font-bold"
        >
          Aa
        </button>
        <button
          title="Save transcripts"
          onClick={() => saveTranscripts(entries)}
          className="p-1 rounded text-[#909090] hover:text-[#f0f0f0] hover:bg-[#323232] transition-colors"
        >
          <Save size={13} />
        </button>
      </div>

      {/* Entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-12 h-12 rounded-full bg-[#2a2a2a] border border-[#383838] flex items-center justify-center">
              <Mic size={18} className="text-[#484848]" />
            </div>
            <div className="text-center">
              <p className="text-[#555] text-xs font-medium">No transcription yet</p>
              <p className="text-[10px] text-[#404040] mt-1">Press TRANSCRIBE to begin</p>
            </div>
          </div>
        ) : (
          entries.map((entry, i) => (
            <TranscriptEntryRow
              key={entry.id}
              entry={entry}
              isLatest={i === entries.length - 1}
              fontSize={fontSize}
              showChannel={i === 0 || entries[i - 1].channelName !== entry.channelName}
            />
          ))
        )}
      </div>

      {entries.length > 0 && (
        <div className="px-3 py-1.5 border-t border-[#333] flex-shrink-0">
          <span className="text-[10px] text-[#606060] tabular-nums">
            {entries.length}개 항목
            {entries.length >= 500 && <span className="text-yellow-500/60"> · 최대 500개</span>}
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
