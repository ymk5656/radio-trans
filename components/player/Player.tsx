'use client'
import { useRef, useEffect, useState, useCallback, type MutableRefObject } from 'react'
import { Channel } from '@/lib/channels'
import { useAudioEngine } from '@/hooks/useAudioEngine'
import { useTranscription, TranscribeStatus } from '@/hooks/useTranscription'
import { TranscriptEntry } from '@/lib/storage'
import { loadEQGains, saveEQGains, getPlaybackDelay, savePlaybackDelay } from '@/lib/storage'
import { EqualizerPanel } from './EqualizerPanel'
import { PlaybackControls } from './PlaybackControls'
import { TranscribeButton } from './TranscribeButton'
import { StatusBadge } from './StatusBadge'
import { WifiOff, Radio } from 'lucide-react'

interface PlayerProps {
  channel: Channel | null
  onTranscriptEntry: (entry: TranscriptEntry) => void
  onSkipped: () => void
  onStatusChange?: (status: TranscribeStatus) => void
  // Translate toggle is owned by Home (button lives above the transcript output).
  isTranslating: boolean
  // Home bridges the 동조 button (now atop the transcript) to handleSyncNow here.
  syncNowRef?: MutableRefObject<(() => void) | null>
  // Home bridges the back-to-equalizer button to stop transcription here.
  stopTranscribeRef?: MutableRefObject<(() => void) | null>
}

type LoadState = 'idle' | 'resolving' | 'loading' | 'playing' | 'error-fallback'

export function Player({ channel, onTranscriptEntry, onSkipped, onStatusChange, isTranslating, syncNowRef, stopTranscribeRef }: PlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hlsRef = useRef<any>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  // User intent to have audio playing. Stays true across unexpected stalls/pauses
  // (so the watchdog can auto-recover); only false on manual pause / channel change / hard error.
  const [playIntent, setPlayIntent] = useState(false)
  const stallLastTimeRef = useRef<number>(-1)
  const stallCountRef = useRef<number>(0)
  const [volume, setVolume] = useState(1)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [syncDelay, setSyncDelay] = useState(() => getPlaybackDelay())
  // ── Auto-sync (동조) ──────────────────────────────────────────────────────
  // Keeps speaker audio aligned with the subtitle by delaying audio by the
  // measured transcription latency. autoSync drives setDelay automatically;
  // the 동조 button applies the latest measurement on demand.
  const [autoSync, setAutoSync] = useState(true)
  const [measuredLatency, setMeasuredLatency] = useState(0)
  const autoSyncRef = useRef(true)
  const isTranscribingRef = useRef(false)
  const latencyEmaRef = useRef(0)        // EMA-smoothed latency (seconds)
  const lastAppliedDelayRef = useRef(0)  // last value pushed to setDelay
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
    setDelay,
  } = useAudioEngine()

  useEffect(() => {
    eqGains.forEach((db, i) => setEQBand(i, db))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleGainsChange = useCallback((gains: number[]) => {
    saveEQGains(gains)
  }, [])

  // Per-chunk end-to-end latency report → drives auto-sync. We EMA-smooth the
  // raw measurement and, when auto-sync is on, push it to the speaker DelayNode
  // so the audio lands together with its subtitle. Threshold avoids jitter.
  const handleLatency = useCallback((seconds: number) => {
    const prev = latencyEmaRef.current
    const ema = prev === 0 ? seconds : prev * 0.7 + seconds * 0.3
    latencyEmaRef.current = ema
    setMeasuredLatency(ema)
    if (autoSyncRef.current && isTranscribingRef.current) {
      const target = Math.min(5, Math.max(0, ema))
      if (Math.abs(target - lastAppliedDelayRef.current) > 0.25) {
        lastAppliedDelayRef.current = target
        setDelay(target)
        setSyncDelay(target)
      }
    }
  }, [setDelay])

  const { startTranscription, stopTranscription, status } = useTranscription({
    mediaStreamRef,
    analyserRef,
    channelId: channel?.id ?? '',
    channelName: channel?.name ?? '',
    language: channel?.language,
    onEntry: onTranscriptEntry,
    onSkipped,
    isTranslatingRef,
    onLatency: handleLatency,
  })

  // Keep refs in sync with state — read by the async transcription/latency loops
  useEffect(() => { isTranslatingRef.current = isTranslating }, [isTranslating])
  useEffect(() => { autoSyncRef.current = autoSync }, [autoSync])
  useEffect(() => { isTranscribingRef.current = isTranscribing }, [isTranscribing])

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
        setPlayIntent(true)
        setLoadState('playing')
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        if (activeSetupRef.current !== setupId) return
        setIsPlaying(false)
        setPlayIntent(false)
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
      setDelay(0)
      setIsTranscribing(false)
    }

    destroyHLS()
    audio.pause()
    audio.src = ''
    setIsPlaying(false)
    setPlayIntent(false)
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

  // Stall/stop watchdog: while the user intends playback, detect an unexpected
  // pause/stop OR a frozen currentTime and auto-recover. Crucially this keys off
  // playIntent (not isPlaying), so it stays alive even after the element pauses —
  // that's exactly when recovery is needed and no manual ▶ is required.
  useEffect(() => {
    if (!playIntent) {
      stallLastTimeRef.current = -1
      stallCountRef.current = 0
      return
    }
    const CHECK_MS = 5000
    const STALL_STRIKES = 2  // 2 × 5s = 10s before recovery attempt

    const recover = () => {
      const audio = audioRef.current
      if (!audio) return
      if (hlsRef.current) {
        hlsRef.current.startLoad()
        audio.play().catch(() => {})
      } else if (audio.src) {
        const src = audio.src
        audio.load()
        audio.src = src
        audio.play().catch(() => {})
      }
    }

    const id = setInterval(() => {
      const audio = audioRef.current
      if (!audio) return

      // Unexpected pause/stop (stall, ended, or upstream reset) while we still
      // want playback → pull from the live edge again.
      if (audio.paused) {
        stallCountRef.current = 0
        recover()
        return
      }

      // Not paused but currentTime frozen → buffer stall; nudge the loader.
      const ct = audio.currentTime
      if (ct > 0 && ct === stallLastTimeRef.current) {
        stallCountRef.current++
        if (stallCountRef.current >= STALL_STRIKES) {
          stallCountRef.current = 0
          recover()
        }
      } else {
        stallCountRef.current = 0
        stallLastTimeRef.current = ct
      }
    }, CHECK_MS)
    return () => clearInterval(id)
  }, [playIntent])

  const handlePlayPause = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      initEngine(audio)
      await resumeContext()
      try {
        await audio.play()
        setIsPlaying(true)
        setPlayIntent(true)
        setLoadState('playing')
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setIsPlaying(false)
        setPlayIntent(false)
        setErrorMsg(err instanceof Error ? err.message : 'Playback failed')
      }
    } else {
      // Manual pause — clear intent so the watchdog doesn't fight the user.
      setPlayIntent(false)
      audio.pause()
      setIsPlaying(false)
    }
  }, [initEngine, resumeContext])

  const handleTranscribeToggle = useCallback(() => {
    if (isTranscribing) {
      stopTranscription()
      setDelay(0)
      setIsTranscribing(false)
    } else {
      // Fresh sync session — drop stale latency estimate, start from saved delay
      latencyEmaRef.current = 0
      lastAppliedDelayRef.current = syncDelay
      startTranscription()
      setDelay(syncDelay)
      setIsTranscribing(true)
    }
  }, [isTranscribing, startTranscription, stopTranscription, setDelay, syncDelay])

  // Manual slider drag — user takes over, so disable auto-sync.
  const handleSyncDelayChange = useCallback((val: number) => {
    setAutoSync(false)
    setSyncDelay(val)
    savePlaybackDelay(val)
    lastAppliedDelayRef.current = val
    if (isTranscribing) setDelay(val)
  }, [isTranscribing, setDelay])

  // 동조 button — snap the speaker delay to the latest measured latency now.
  const handleSyncNow = useCallback(() => {
    const target = Math.min(5, Math.max(0, latencyEmaRef.current))
    lastAppliedDelayRef.current = target
    setSyncDelay(target)
    savePlaybackDelay(target)
    if (isTranscribing) setDelay(target)
  }, [isTranscribing, setDelay])

  // Expose 동조 to Home so the button can live atop the transcript panel.
  useEffect(() => {
    if (syncNowRef) syncNowRef.current = handleSyncNow
    return () => {
      if (syncNowRef) syncNowRef.current = null
    }
  }, [handleSyncNow, syncNowRef])

  // Stop the transcription session (no-op if not transcribing). Bridged to the
  // back-to-equalizer button so leaving the transcript also ends transcription.
  const stopTranscribing = useCallback(() => {
    if (isTranscribing) {
      stopTranscription()
      setDelay(0)
      setIsTranscribing(false)
    }
  }, [isTranscribing, stopTranscription, setDelay])

  useEffect(() => {
    if (stopTranscribeRef) stopTranscribeRef.current = stopTranscribing
    return () => {
      if (stopTranscribeRef) stopTranscribeRef.current = null
    }
  }, [stopTranscribing, stopTranscribeRef])

  // Pure iframe channel (user-added custom type)
  const isIframe = channel?.mode === 'iframe' && !channel.apiResolver && !channel.streamUrl
  const transcribeDisabled = isIframe

  const eqPanel = channel ? (
    <div className="w-full bg-[#1e1e1e] rounded-xl border border-[#333] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="text-[10px] text-[#606060] uppercase tracking-widest mb-3 font-medium">Equalizer</div>
      <EqualizerPanel
        initialGains={eqGains}
        onBandChange={setEQBand}
        onReset={resetEQ}
        onGainsChange={handleGainsChange}
      />
    </div>
  ) : null

  // Audio bar heights for the "now playing" animation
  const audioBars = [35, 70, 50, 85, 45, 65, 40]

  return (
    <div className="flex-1 flex flex-col bg-[#262626] overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-[#383838] flex-shrink-0">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] text-[#606060] uppercase tracking-widest font-medium">Now Playing</span>
              {isPlaying && (
                <span className="flex items-center gap-1.5 text-[9px] text-green-400 font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            {channel ? (
              <>
                <div className="text-xl font-bold text-[#f0f0f0] truncate leading-tight">{channel.name}</div>
                <div className="text-sm text-[#707070] mt-1">{channel.location}</div>
              </>
            ) : (
              <div className="text-[#555] text-sm">채널을 선택하세요</div>
            )}
          </div>
          {/* Audio level bars — CSS-only animation */}
          {isPlaying && (
            <div className="flex items-end gap-[3px] h-6 mt-1 ml-4 flex-shrink-0">
              {audioBars.map((h, i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-full bg-green-500/60 origin-bottom"
                  style={{
                    height: `${h}%`,
                    animation: `audio-bar 0.9s ease-in-out infinite`,
                    animationDelay: `${i * 110}ms`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4 overflow-y-auto py-4">
        {!channel ? (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-[#2a2a2a] border border-[#383838] flex items-center justify-center mx-auto mb-4">
              <Radio size={26} className="text-[#484848]" />
            </div>
            <p className="text-[#555] text-sm font-medium">No channel selected</p>
            <p className="text-[#404040] text-xs mt-1">Choose a station from the sidebar</p>
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
              <div className="flex flex-col items-center gap-3">
                <div className="spinner" />
                <span className="text-xs text-[#707070]">
                  {loadState === 'resolving' ? 'Resolving stream…' : 'Connecting…'}
                </span>
              </div>
            )}

            {/* Error — no iframe fallback */}
            {loadState === 'error-fallback' && (
              <div className="flex items-start gap-3 px-4 py-3 bg-red-500/[0.07] border border-red-500/20 rounded-xl text-sm text-red-300 w-full">
                <WifiOff size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-red-300">Connection failed</div>
                  {errorMsg && <div className="text-xs text-red-400/70 mt-0.5 font-mono">{errorMsg}</div>}
                </div>
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
          <div className="flex flex-col items-center gap-2 w-full">
            <TranscribeButton
              status={transcribeStatus}
              isActive={isTranscribing}
              disabled={transcribeDisabled}
              onClick={handleTranscribeToggle}
            />
            <StatusBadge status={transcribeStatus} errorMsg={errorMsg} />
            {isTranscribing && (
              <div className="w-full max-w-xs px-3 py-2 bg-[#1e1e1e] rounded-xl border border-[#333] mt-1">
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
                  onChange={e => handleSyncDelayChange(parseFloat(e.target.value))}
                  className="w-full h-1 appearance-none bg-[#404040] rounded-full outline-none cursor-pointer accent-green-500"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-[#484848]">0s</span>
                  <span className="text-[9px] text-[#484848]">5s</span>
                </div>
                {/* 자동 동조 toggle + measured latency (the manual 동조 button now
                    lives atop the transcript panel). */}
                <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-[#333]">
                  <button
                    onClick={() => setAutoSync(v => !v)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all duration-150 active:scale-90 ${
                      autoSync
                        ? 'bg-green-500/20 text-green-300'
                        : 'text-[#707070] hover:text-[#f0f0f0] hover:bg-white/[0.06]'
                    }`}
                    title={autoSync ? '자동 동조 켜짐' : '자동 동조 꺼짐'}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${autoSync ? 'bg-green-400 animate-pulse' : 'bg-[#555]'}`} />
                    자동 동조
                  </button>
                  <span className="text-[9px] text-[#606060] font-mono" title="측정된 전사 지연">
                    ~{measuredLatency.toFixed(1)}s
                  </span>
                </div>
              </div>
            )}
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
