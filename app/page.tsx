'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { Channel } from '@/lib/channels'
import {
  TranscriptEntry,
  loadChannels,
  saveChannels,
  loadTranscripts,
  saveTranscripts,
} from '@/lib/storage'
import { TitleBar } from '@/components/layout/TitleBar'
import { BottomBar } from '@/components/layout/BottomBar'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { Player } from '@/components/player/Player'
import { TranscriptPanel } from '@/components/transcript/TranscriptPanel'
import { TranscribeStatus } from '@/hooks/useTranscription'
import { Radio, Mic } from 'lucide-react'

export default function Home() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([])
  const [skippedCount, setSkippedCount] = useState(0)
  const [transcribeStatus, setTranscribeStatus] = useState<TranscribeStatus>('idle')
  // Translation toggle lifted here so the 번역 button lives above the transcript
  // output (TranscriptPanel) while the transcription loop (Player) still reads it.
  const [isTranslating, setIsTranslating] = useState(false)

  // Stop-transcription bridge: the back-to-equalizer button stops the session
  // so new entries stop arriving (otherwise they auto-switch back to transcript).
  const stopTranscribeRef = useRef<(() => void) | null>(null)

  // Sync-delay control lives in the transcript panel now. Player publishes its
  // live value up (mirrored here) and exposes the setter through this ref.
  // Mirror default must match Player's source of truth: 3s delay.
  const [syncDelay, setSyncDelay] = useState(3)
  const setSyncDelayRef = useRef<((val: number) => void) | null>(null)

  const handleSyncStateChange = useCallback(
    (s: { syncDelay: number }) => {
      setSyncDelay(s.syncDelay)
    },
    []
  )

  // Sticky reason transcription has stalled (e.g. daily Groq quota used up),
  // bubbled up from the Player's hook and shown as a banner on the transcript.
  const [transcribeError, setTranscribeError] = useState('')

  // Mobile state
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'player' | 'transcript'>('player')

  useEffect(() => {
    setChannels(loadChannels())
    setTranscripts(loadTranscripts())
  }, [])

  // Close sidebar on channel select (mobile)
  const handleChannelSelect = useCallback((channel: Channel) => {
    setActiveChannel(channel)
    setSidebarOpen(false)
    setMobilePanel('player')
  }, [])

  const handleReorder = useCallback((reordered: Channel[]) => {
    setChannels(reordered)
    saveChannels(reordered)
  }, [])

  const handleAddChannel = useCallback((channel: Channel) => {
    setChannels(prev => {
      const updated = [...prev, { ...channel, order: prev.length }]
      saveChannels(updated)
      return updated
    })
  }, [])

  const handleRemoveChannel = useCallback((channel: Channel) => {
    setChannels(prev => {
      const updated = prev.filter(c => c.id !== channel.id)
      saveChannels(updated)
      return updated
    })
    setActiveChannel(prev => prev?.id === channel.id ? null : prev)
  }, [])

  const handleTranscriptEntry = useCallback((entry: TranscriptEntry) => {
    setTranscripts(prev => {
      const updated = [...prev, entry].slice(-500)
      saveTranscripts(updated)
      return updated
    })
    // Auto-switch to transcript panel on mobile when entries arrive
    setMobilePanel('transcript')
  }, [])

  // Patch an existing entry in place (e.g. fill in the async translation).
  const handleTranscriptEntryUpdate = useCallback(
    (id: string, patch: Partial<TranscriptEntry>) => {
      setTranscripts(prev => {
        let changed = false
        const updated = prev.map(e => {
          if (e.id !== id) return e
          changed = true
          return { ...e, ...patch }
        })
        if (!changed) return prev   // entry already dropped by the 500-cap
        saveTranscripts(updated)
        return updated
      })
    },
    []
  )

  const handleStatusChange = useCallback((status: TranscribeStatus) => {
    setTranscribeStatus(status)
    // On mobile, jump to the transcript screen the moment transcription becomes
    // active — don't wait for the first entry (the sync delay makes that lag).
    if (status !== 'idle') setMobilePanel('transcript')
  }, [])

  const handleSkipped = useCallback(() => {
    setSkippedCount(n => n + 1)
  }, [])

  const handleSave = useCallback(() => {
    saveTranscripts(transcripts)
    saveChannels(channels)
  }, [transcripts, channels])

  const handleRefresh = useCallback(() => {
    window.location.reload()
  }, [])

  const handleTranslateToggle = useCallback(() => {
    setIsTranslating(prev => !prev)
  }, [])

  const handleTranscribeError = useCallback((message: string) => {
    setTranscribeError(message)
  }, [])

  const handleBackToPlayer = useCallback(() => {
    // Stop transcription first; otherwise a freshly arriving entry would flip
    // mobilePanel back to 'transcript' and bounce the user off the equalizer.
    stopTranscribeRef.current?.()
    setMobilePanel('player')
  }, [])

  return (
    <div className="flex flex-col app-vh bg-[#1c1c1c] overflow-hidden">
      <TitleBar onMenuClick={() => setSidebarOpen(prev => !prev)} />

      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Sidebar ─────────────────────────────────────────── */}
        {/* Desktop: always visible. Mobile: slide-in drawer */}
        <div
          className={`
            flex-shrink-0 flex flex-col
            absolute md:relative inset-y-0 left-0 z-40 md:z-auto
            transition-transform duration-300
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          `}
        >
          <Sidebar
            channels={channels}
            activeChannel={activeChannel}
            onSelect={handleChannelSelect}
            onReorder={handleReorder}
            onAddChannel={handleAddChannel}
            onRemoveChannel={handleRemoveChannel}
          />
        </div>

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Player ───────────────────────────────────────────── */}
        <div className={`flex-1 overflow-hidden ${mobilePanel === 'player' ? 'flex flex-col' : 'hidden md:flex md:flex-col'}`}>
          <Player
            channel={activeChannel}
            onTranscriptEntry={handleTranscriptEntry}
            onTranscriptEntryUpdate={handleTranscriptEntryUpdate}
            onSkipped={handleSkipped}
            onStatusChange={handleStatusChange}
            isTranslating={isTranslating}
            stopTranscribeRef={stopTranscribeRef}
            onSyncStateChange={handleSyncStateChange}
            setSyncDelayRef={setSyncDelayRef}
            onTranscribeError={handleTranscribeError}
          />
        </div>

        {/* ── Transcript Panel ─────────────────────────────────── */}
        <div className={`${mobilePanel === 'transcript' ? 'flex flex-col flex-1 w-full' : 'hidden md:flex md:flex-col md:w-[320px] md:flex-shrink-0'}`}>
          <TranscriptPanel
            entries={transcripts}
            status={transcribeStatus}
            isTranslating={isTranslating}
            onTranslateToggle={handleTranslateToggle}
            syncActive={transcribeStatus !== 'idle'}
            onBackToPlayer={handleBackToPlayer}
            syncDelay={syncDelay}
            onSyncDelayChange={(v) => setSyncDelayRef.current?.(v)}
            errorMessage={transcribeError}
          />
        </div>
      </div>

      {/* ── Mobile bottom tab bar ───────────────────────────────── */}
      <div
        className="md:hidden flex border-t border-[#404040] bg-[#1c1c1c] flex-shrink-0"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button
          onClick={() => setMobilePanel('player')}
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs transition-colors
            ${mobilePanel === 'player' ? 'text-green-400' : 'text-[#707070]'}`}
        >
          <Radio size={16} />
          <span>플레이어</span>
        </button>
        <button
          onClick={() => setMobilePanel('transcript')}
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs transition-colors
            ${mobilePanel === 'transcript' ? 'text-green-400' : 'text-[#707070]'}`}
        >
          <Mic size={16} />
          <span>전사</span>
        </button>
      </div>

      {/* BottomBar — desktop only on mobile it clutters the small screen */}
      <div className="hidden md:block">
        <BottomBar
          transcripts={transcripts}
          skippedCount={skippedCount}
          onRefresh={handleRefresh}
          onSave={handleSave}
        />
      </div>
    </div>
  )
}
