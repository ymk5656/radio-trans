'use client'
import { useRef, useEffect, useState, useCallback } from 'react'
import { Channel } from '@/lib/channels'
import { useAudioEngine } from '@/hooks/useAudioEngine'
import { useTranscription, TranscribeStatus } from '@/hooks/useTranscription'
import { TranscriptEntry } from '@/lib/storage'
import { loadEQGains, saveEQGains } from '@/lib/storage'
import { EqualizerPanel } from './EqualizerPanel'
import { PlaybackControls } from './PlaybackControls'
import { TranscribeButton } from './TranscribeButton'
import { StatusBadge } from './StatusBadge'
import { WifiOff } from 'lucide-react'

interface PlayerProps {
  channel: Channel | null
  onTranscriptEntry: (entry: TranscriptEntry) => void
  onSkipped: () => void
  onStatusChange?: (status: TranscribeStatus) => void
}

type LoadState = 'idle' | 'resolving' | 'loading' | 'playing' | 'error-fallback'

export function Player({ channel, onTranscriptEntry, onSkipped, onStatusChange }: PlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hlsRef = useRef<any>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const stallLastTimeRef = useRef<number>(-1)
  const stallCountRef = useRef<number>(0)
  const [volume, setVolume] = useState(1)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const [transcribeStatus, setTranscribeStatus] = useState<TranscribeStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [loadState, setLoadState] = useState<LoadState>('idle')
  // Incremented on every channel change — stale async callbacks check this before updating state
  const activeSetupRef = useRef<number>(0)
  // Mutable ref so the transcription loop always reads the latest translate setting
  const isTranslatingRef = useRef(false)

  // EQ: global, persisted in localStorage — not reset when switching channels
  const [eqGains] = useState<number[]>(() => loadEQGains())

  const {
    analyserRef,
    mediaStreamRef,
    initEngine,
    resumeContext,
    setVolume: setGainVolume,
    setEQBand,
    resetEQ,
  } = useAudioEngine()

  useEffect(() => {
    eqGains.forEach((db, i) => setEQBand(i, db))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleGainsChange = useCallback((gains: number[]) => {
    saveEQGains(gains)
  }, [])

  const { startTranscription, stopTranscription, status } = useTranscription({
    mediaStreamRef,
    analyserRef,
    channelId: channel?.id ?? '',
    channelName: channel?.name ?? '',
    onEntry: onTranscriptEntry,
    onSkipped,
    isTranslatingRef,
  })

  // Keep ref in sync with state — runs after every render where isTranslating changed
  useEffect(() => { isTranslatingRef.current = isTranslating }, [isTranslating])

  useEffect(() => {
    setTranscribeStatus(status)
    onStatusChange?.(status)
  }, [status, onStatusChange])

  const destroyHLS = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
  }, [])

  /**
   * Load a URL into the audio element.
   * ALL HLS streams are routed through /api/hls proxy to avoid CORS issues
   * with Korean CDNs (KBS, MBC, SBS, EBS).
   * MP3/AAC streams route through /api/stream proxy.
   */
  const loadUrl = useCallback(
    async (url: string, audio: HTMLAudioElement): Promise<boolean> => {
      destroyHLS()
      const isHLS = url.includes('.m3u8') || url.includes('playlist')

      if (isHLS) {
        const { default: Hls } = await import('hls.js')
        if (Hls.isSupported()) {
          return new Promise(resolve => {
            let settled = false
            const settle = (val: boolean) => {
              if (settled) return
              settled = true
              clearTimeout(timer)
              resolve(val)
            }
            const timer = setTimeout(() => settle(false), 20000)

            const hls = new Hls({
              enableWorker: false,
              lowLatencyMode: false,
              fragLoadingMaxRetry: 4,
              manifestLoadingMaxRetry: 3,
              levelLoadingMaxRetry: 3,
            })
            hlsRef.current = hls
            // Route through /api/hls proxy — rewrites segment URLs to avoid CORS
            const proxyUrl = `/api/hls?url=${encodeURIComponent(url)}`
            hls.loadSource(proxyUrl)
            hls.attachMedia(audio)
            hls.on(Hls.Events.MANIFEST_PARSED, () => settle(true))
            hls.on(Hls.Events.ERROR, (_: unknown, data: { fatal: boolean; type: string }) => {
              if (!data.fatal) return
              if (!settled) {
                settle(false)
              } else {
                const HlsStatic = Hls
                if (data.type === HlsStatic.ErrorTypes?.NETWORK_ERROR) {
                  hls.startLoad()
                } else if (data.type === HlsStatic.ErrorTypes?.MEDIA_ERROR) {
                  hls.recoverMediaError()
                }
              }
            })
          })
        } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS — use proxy too
          audio.src = `/api/hls?url=${encodeURIComponent(url)}`
          return true
        } else {
          return false
        }
      } else {
        // Plain MP3/AAC — route through same-origin stream proxy
        audio.src = `/api/stream?url=${encodeURIComponent(url)}`
        return true
      }
    },
    [destroyHLS]
  )

  const doPlay = useCallback(
    async (audio: HTMLAudioElement, setupId: number) => {
      initEngine(audio)
      await resumeContext()
      try {
        await audio.play()
        if (activeSetupRef.current !== setupId) return
        setIsPlaying(true)
        setLoadState('playing')
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        if (activeSetupRef.current !== setupId) return
        setIsPlaying(false)
        const msg = err instanceof Error ? err.message : 'Playback failed'
        setErrorMsg(msg)
        setLoadState('error-fallback')
      }
    },
    [initEngine, resumeContext]
  )

  const setupChannel = useCallback(
    async (ch: Channel, audio: HTMLAudioElement, setupId: number) => {
      setErrorMsg('')

      // Pure iframe channel (user-added) — no audio stream
      if (ch.mode === 'iframe' && !ch.apiResolver && !ch.streamUrl) {
        setLoadState('idle')
        return
      }

      // Korean / API-resolved channels
      if (ch.apiResolver) {
        setLoadState('resolving')
        try {
          const params = new URLSearchParams({
            type: ch.apiResolver.type,
            ...(ch.apiResolver.code ? { code: ch.apiResolver.code } : {}),
            ...(ch.apiResolver.ch ? { ch: ch.apiResolver.ch } : {}),
          })
          const res = await fetch(`/api/resolve-stream?${params}`)
          if (activeSetupRef.current !== setupId) return
          if (!res.ok) throw new Error(`Resolve failed: ${res.status}`)
          const data = await res.json()
          if (!data.url) throw new Error('No stream URL returned')
          setLoadState('loading')
          const ok = await loadUrl(data.url, audio)
          if (activeSetupRef.current !== setupId) return
          if (ok) {
            await doPlay(audio, setupId)
          } else {
            setErrorMsg('스트림 로드 실패')
            setLoadState('error-fallback')
          }
        } catch (err) {
          if (activeSetupRef.current !== setupId) return
          const msg = err instanceof Error ? err.message : 'Resolve error'
          setErrorMsg(msg)
          setLoadState('error-fallback')
        }
        return
      }

      // Direct stream URL
      if (ch.streamUrl) {
        setLoadState('loading')
        const ok = await loadUrl(ch.streamUrl, audio)
        if (activeSetupRef.current !== setupId) return
        if (ok) {
          await doPlay(audio, setupId)
        } else {
          setErrorMsg('스트림 로드 실패')
          setLoadState('error-fallback')
        }
        return
      }

      setLoadState('idle')
    },
    [loadUrl, doPlay]
  )

  // Re-setup on channel change
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const setupId = ++activeSetupRef.current

    if (isTranscribing) {
      stopTranscription()
      setIsTranscribing(false)
    }

    destroyHLS()
    audio.pause()
    audio.src = ''
    setIsPlaying(false)
    setLoadState('idle')
    setErrorMsg('')
    stallLastTimeRef.current = -1
    stallCountRef.current = 0

    if (!channel) return
    setupChannel(channel, audio, setupId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id])

  // Volume sync
  useEffect(() => {
    setGainVolume(volume)
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume, setGainVolume])

  // Stall watchdog: detects frozen currentTime and attempts recovery
  useEffect(() => {
    if (!isPlaying) {
      stallLastTimeRef.current = -1
      stallCountRef.current = 0
      return
    }
    const CHECK_MS = 5000
    const STALL_STRIKES = 2  // 2 × 5s = 10s before recovery attempt
    const id = setInterval(() => {
      const audio = audioRef.current
      if (!audio || audio.paused) return
      const ct = audio.currentTime
      if (ct > 0 && ct === stallLastTimeRef.current) {
        stallCountRef.current++
        if (stallCountRef.current >= STALL_STRIKES) {
          stallCountRef.current = 0
          if (hlsRef.current) {
            hlsRef.current.startLoad()
          } else if (audio.src) {
            const src = audio.src
            audio.load()
            audio.src = src
            audio.play().catch(() => {})
          }
        }
      } else {
        stallCountRef.current = 0
        stallLastTimeRef.current = ct
      }
    }, CHECK_MS)
    return () => clearInterval(id)
  }, [isPlaying])

  const handlePlayPause = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      initEngine(audio)
      await resumeContext()
      try {
        await audio.play()
        setIsPlaying(true)
        setLoadState('playing')
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setIsPlaying(false)
        setErrorMsg(err instanceof Error ? err.message : 'Playback failed')
      }
    } else {
      audio.pause()
      setIsPlaying(false)
    }
  }, [initEngine, resumeContext])

  const handleTranscribeToggle = useCallback(() => {
    if (isTranscribing) {
      stopTranscription()
      setIsTranscribing(false)
    } else {
      startTranscription()
      setIsTranscribing(true)
    }
  }, [isTranscribing, startTranscription, stopTranscription])

  const handleTranslateToggle = useCallback(() => {
    setIsTranslating(prev => !prev)
  }, [])

  // Pure iframe channel (user-added custom type)
  const isIframe = channel?.mode === 'iframe' && !channel.apiResolver && !channel.streamUrl
  const transcribeDisabled = isIframe

  const eqPanel = channel ? (
    <div className="w-full bg-[#1e1e1e] rounded-xl border border-[#383838] p-4">
      <div className="text-[10px] text-[#707070] uppercase tracking-widest mb-3">Equalizer</div>
      <EqualizerPanel
        initialGains={eqGains}
        onBandChange={setEQBand}
        onReset={resetEQ}
        onGainsChange={handleGainsChange}
      />
    </div>
  ) : null

  return (
    <div className="flex-1 flex flex-col bg-[#262626] overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b border-[#404040]">
        <div className="text-[10px] text-[#909090] uppercase tracking-widest mb-1">Now Playing</div>
        {channel ? (
          <>
            <div className="text-xl font-bold text-[#f0f0f0] truncate">{channel.name}</div>
            <div className="text-sm text-[#a0a0a0] mt-0.5">{channel.location}</div>
          </>
        ) : (
          <div className="text-[#707070] text-sm">채널을 선택하세요</div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4 overflow-y-auto py-4">
        {!channel ? (
          <div className="text-center text-[#555]">
            <div className="text-4xl mb-2">📻</div>
            <p className="text-sm">사이드바에서 채널을 선택하세요</p>
          </div>
        ) : isIframe && channel.iframeUrl ? (
          /* Pure user-added iframe channel */
          <div className="w-full h-[220px] rounded-lg overflow-hidden border border-[#404040]">
            <iframe
              src={channel.iframeUrl}
              className="w-full h-full"
              title={channel.name}
              allow="autoplay"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        ) : (
          /* Stream mode — waveform always visible */
          <>
            {/* Loading states */}
            {(loadState === 'resolving' || loadState === 'loading') && (
              <div className="text-xs text-[#909090] animate-pulse">
                {loadState === 'resolving' ? '스트림 URL 해석 중...' : '스트림 연결 중...'}
              </div>
            )}

            {/* Error — no iframe fallback */}
            {loadState === 'error-fallback' && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-300 w-full">
                <WifiOff size={12} />
                스트림 연결 실패
                {errorMsg && <span className="text-red-400 ml-1">: {errorMsg}</span>}
              </div>
            )}

            {eqPanel}

            <PlaybackControls
              isPlaying={isPlaying}
              volume={volume}
              onPlayPause={handlePlayPause}
              onVolumeChange={setVolume}
            />
          </>
        )}

        {channel && (
          <div className="flex flex-col items-center gap-2">
            <TranscribeButton
              status={transcribeStatus}
              isActive={isTranscribing}
              isTranslating={isTranslating}
              disabled={transcribeDisabled}
              onClick={handleTranscribeToggle}
              onTranslateClick={handleTranslateToggle}
            />
            <StatusBadge status={transcribeStatus} errorMsg={errorMsg} />
          </div>
        )}
      </div>

      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => {
          setIsPlaying(false)
          if (loadState !== 'error-fallback') {
            setLoadState('error-fallback')
            // HLS.js manages its own errors; only set error state for non-HLS
            if (!hlsRef.current) {
              setErrorMsg('오디오 스트림 오류')
            }
          }
        }}
      />
    </div>
  )
}
