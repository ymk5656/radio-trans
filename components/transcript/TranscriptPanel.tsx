'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { ClipboardCopy, Maximize2, Mic, Globe, SlidersHorizontal, FileText } from 'lucide-react'
import { TranscriptEntry, exportTranscriptsAsTxt } from '@/lib/storage'
import { TranscribeStatus } from '@/hooks/useTranscription'
import { TranscriptEntryRow } from './TranscriptEntry'
import { FocusMode } from './FocusMode'

interface TranscriptPanelProps {
  entries: TranscriptEntry[]
  status: TranscribeStatus
  isTranslating: boolean
  onTranslateToggle: () => void
  // True while a transcription session is active — gates the Sync Delay block.
  syncActive: boolean
  // Return to the player/equalizer screen (mobile single-panel layout).
  onBackToPlayer: () => void
  // Sync-delay control (moved here from the player). The value is mirrored from
  // Player via Home; the handler drives Player's setter through a ref bridge.
  syncDelay: number
  onSyncDelayChange: (val: number) => void
  // Sticky reason transcription has stalled (e.g. daily quota). Empty when fine.
  errorMessage: string
}

export function TranscriptPanel({ entries, status, isTranslating, onTranslateToggle, syncActive, onBackToPlayer, syncDelay, onSyncDelayChange, errorMessage }: TranscriptPanelProps) {
  const [fontSize, setFontSize] = useState(13)
  const [focusMode, setFocusMode] = useState(false)
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const lastAutoScrollAt = useRef(0)

  const prevEntriesLength = useRef(entries.length)

  // Auto-follow: when the user is parked near the bottom, keep the view pinned
  // to the latest line as new entries arrive or the font size reflows content.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    // If entries count increased, check if the user was near the bottom *before* this new entry was added.
    // The height of a new entry is at most 350px.
    if (entries.length > prevEntriesLength.current) {
      const wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 350
      if (wasAtBottom) {
        isAtBottomRef.current = true
      }
      prevEntriesLength.current = entries.length
    }

    if (isAtBottomRef.current) {
      lastAutoScrollAt.current = performance.now()
      el.scrollTop = el.scrollHeight
    }
  }, [entries, fontSize])

  // The live placeholder appears/disappears as transcription toggles between
  // recording and decoding. Re-pin to the bottom when it does, so the "working"
  // indicator stays in view for a user who's parked at the latest line.
  const showPlaceholder = status === 'receiving' || status === 'transcribing'
  useEffect(() => {
    const el = scrollRef.current
    if (el && isAtBottomRef.current) {
      lastAutoScrollAt.current = performance.now()
      el.scrollTop = el.scrollHeight
    }
  }, [showPlaceholder])

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
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#383838] flex-shrink-0">
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

      {/* Toolbar — 번역, copy all, Aa, save, focus mode (one row, in order) */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#404040]">
        {/* 번역 toggle — translation can be turned on/off at transcription time */}
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
          <span className="text-[10px] text-green-400">Copied!</span>
        )}
        <button
          onClick={() => exportTranscriptsAsTxt(entries)}
          disabled={entries.length === 0}
          className="p-1.5 rounded-lg text-[#707070] hover:text-[#f0f0f0] hover:bg-white/[0.06] transition-all duration-150 active:scale-90 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-default"
          title="Export as TXT"
        >
          <FileText size={12} />
        </button>
        <button
          title="Font size"
          onClick={() => setFontSize(fontSize >= 24 ? 14 : fontSize + 2)}
          className="p-1.5 rounded-lg text-[#909090] hover:text-[#f0f0f0] hover:bg-white/[0.06] transition-all duration-150 active:scale-90 text-xs font-bold"
        >
          Aa
        </button>
        <button
          onClick={() => setFocusMode(true)}
          className="p-1.5 rounded-lg text-[#707070] hover:text-[#f0f0f0] hover:bg-white/[0.06] transition-all duration-150 active:scale-90"
          title="Focus Mode"
        >
          <Maximize2 size={12} />
        </button>
      </div>

      {/* Sync Delay — moved here from the player. Active only while transcribing. */}
      {syncActive && (
        <div className="px-3 py-2 border-b border-[#404040]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-[#606060] uppercase tracking-widest font-medium">Sync Delay</span>
            <span className="text-[11px] text-[#909090] font-mono">{syncDelay.toFixed(1)}s</span>
          </div>
          <input
            type="range"
            min={0}
            max={5}
            step={0.1}
            value={syncDelay}
            onChange={e => onSyncDelayChange(parseFloat(e.target.value))}
            className="w-full h-1 appearance-none bg-[#404040] rounded-full outline-none cursor-pointer accent-green-500"
          />
        </div>
      )}

      {/* Stall banner — e.g. daily Groq quota exhausted. Sticky until recovery. */}
      {errorMessage && (
        <div className="px-3 py-2 border-b border-yellow-500/20 bg-yellow-500/10 flex-shrink-0">
          <p className="text-[11px] leading-snug text-yellow-300/90">{errorMessage}</p>
        </div>
      )}

      {/* Entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto"
      >
        {entries.length === 0 ? (
          showPlaceholder ? (
            // First chunk hasn't landed yet — show the live indicator instead of
            // a dead "press transcribe" hint, so the ~4s wait reads as activity.
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-12 h-12 rounded-full bg-[#2a2a2a] border border-green-500/30 flex items-center justify-center">
                <Mic size={18} className="text-green-500/70 animate-pulse" />
              </div>
              <p className="text-[11px] text-[#707070] font-medium">
                {status === 'transcribing' ? '전사 중…' : '듣는 중…'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-12 h-12 rounded-full bg-[#2a2a2a] border border-[#383838] flex items-center justify-center">
                <Mic size={18} className="text-[#484848]" />
              </div>
              <div className="text-center">
                <p className="text-[#555] text-xs font-medium">No transcription yet</p>
                <p className="text-[10px] text-[#404040] mt-1">Press TRANSCRIBE to begin</p>
              </div>
            </div>
          )
        ) : (
          <>
            {entries.map((entry, i) => (
              <TranscriptEntryRow
                key={entry.id}
                entry={entry}
                isLatest={i === entries.length - 1}
                fontSize={fontSize}
                showChannel={i === 0 || entries[i - 1].channelName !== entry.channelName}
              />
            ))}
            {showPlaceholder && <LivePlaceholder label={status === 'transcribing' ? '전사 중' : '듣는 중'} />}
          </>
        )}
      </div>

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

// "Next line cooking" row pinned below the latest entry while transcription is
// recording or decoding — shimmer bars keep the panel feeling alive in the gap
// between committed lines, so a 4–5s chunk cadence never reads as a freeze.
function LivePlaceholder({ label }: { label: string }) {
  return (
    <div className="px-3 py-2.5 border-l-2 border-l-green-500/40 bg-green-500/[0.02]">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
        <span className="text-[9px] font-bold uppercase tracking-wider text-green-500/70 flex-shrink-0">
          {label}
        </span>
        <span className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="h-2 rounded-full bg-[#3a3a3a] animate-pulse" style={{ width: '38%' }} />
          <span className="h-2 rounded-full bg-[#343434] animate-pulse" style={{ width: '24%', animationDelay: '160ms' }} />
          <span className="h-2 rounded-full bg-[#2f2f2f] animate-pulse" style={{ width: '16%', animationDelay: '320ms' }} />
        </span>
      </div>
    </div>
  )
}
