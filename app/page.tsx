'use client'
import { useState, useCallback, useEffect } from 'react'
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

  return (
    <div className="flex flex-col h-screen bg-[#1c1c1c] overflow-hidden">
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
            onSkipped={handleSkipped}
            onStatusChange={setTranscribeStatus}
          />
        </div>

        {/* ── Transcript Panel ─────────────────────────────────── */}
        <div className={`${mobilePanel === 'transcript' ? 'flex flex-col flex-1 w-full' : 'hidden md:flex md:flex-col md:w-[320px] md:flex-shrink-0'}`}>
          <TranscriptPanel
            entries={transcripts}
            status={transcribeStatus}
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
