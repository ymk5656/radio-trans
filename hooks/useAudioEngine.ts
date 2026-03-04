'use client'
import { useRef, useCallback, useEffect } from 'react'

export const EQ_BANDS = [
  { freq: 32,    label: '32Hz',  short: '32' },
  { freq: 64,    label: '64Hz',  short: '64' },
  { freq: 125,   label: '125Hz', short: '125' },
  { freq: 250,   label: '250Hz', short: '250' },
  { freq: 500,   label: '500Hz', short: '500' },
  { freq: 1000,  label: '1kHz',  short: '1k' },
  { freq: 2000,  label: '2kHz',  short: '2k' },
  { freq: 4000,  label: '4kHz',  short: '4k' },
  { freq: 8000,  label: '8kHz',  short: '8k' },
  { freq: 16000, label: '16kHz', short: '16k' },
]

export interface AudioEngine {
  analyserRef: React.RefObject<AnalyserNode | null>
  mediaStreamRef: React.RefObject<MediaStream | null>
  eqNodesRef: React.RefObject<BiquadFilterNode[] | null>
  /** Call once per audio element (idempotent) — must be in user-gesture context */
  initEngine: (audioEl: HTMLAudioElement) => void
  /** Resume suspended AudioContext — call from user-gesture handler */
  resumeContext: () => Promise<void>
  setVolume: (vol: number) => void
  setEQBand: (bandIndex: number, gainDb: number) => void
  resetEQ: () => void
  cleanup: () => void
}

export function useAudioEngine(): AudioEngine {
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const eqNodesRef = useRef<BiquadFilterNode[] | null>(null)
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)

  /**
   * Prime the AudioContext on any user gesture (click/keydown).
   * This ensures the AudioContext is created and running BEFORE initEngine
   * is called from useEffect (which is outside the user-gesture context).
   */
  useEffect(() => {
    const unlock = () => {
      if (!ctxRef.current) {
        // Create AudioContext inside gesture handler → starts in 'running' state
        ctxRef.current = new AudioContext()
      } else if (ctxRef.current.state === 'suspended') {
        ctxRef.current.resume()
      }
    }
    document.addEventListener('click', unlock)
    document.addEventListener('keydown', unlock)
    return () => {
      document.removeEventListener('click', unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, [])

  const initEngine = useCallback((audioEl: HTMLAudioElement) => {
    if (sourceRef.current) return  // already initialized for this audio element

    // Reuse AudioContext primed by click listener (already running),
    // or create a new one as fallback
    const ctx = ctxRef.current ?? new AudioContext()
    ctxRef.current = ctx

    const source = ctx.createMediaElementSource(audioEl)
    sourceRef.current = source

    const gain = ctx.createGain()
    gainRef.current = gain
    gain.gain.value = 1

    // ── EQ chain: 10 peaking filters ──────────────
    const eqNodes = EQ_BANDS.map(band => {
      const node = ctx.createBiquadFilter()
      node.type = 'peaking'
      node.frequency.value = band.freq
      node.Q.value = 1.4
      node.gain.value = 0
      return node
    })
    eqNodesRef.current = eqNodes

    const analyser = ctx.createAnalyser()
    analyserRef.current = analyser
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.8

    const dest = ctx.createMediaStreamDestination()
    destRef.current = dest
    mediaStreamRef.current = dest.stream

    // Graph: source → gain → eq[0] → ... → eq[9] → analyser → speakers
    //                                              → dest (recording, bypasses EQ)
    source.connect(gain)
    gain.connect(eqNodes[0])
    for (let i = 0; i < eqNodes.length - 1; i++) {
      eqNodes[i].connect(eqNodes[i + 1])
    }
    eqNodes[eqNodes.length - 1].connect(analyser)
    analyser.connect(ctx.destination)
    gain.connect(dest)
  }, [])

  const resumeContext = useCallback(async () => {
    if (ctxRef.current && ctxRef.current.state === 'suspended') {
      await ctxRef.current.resume()
    }
  }, [])

  const setVolume = useCallback((vol: number) => {
    if (gainRef.current) {
      gainRef.current.gain.value = Math.max(0, Math.min(1, vol))
    }
  }, [])

  const setEQBand = useCallback((bandIndex: number, gainDb: number) => {
    const nodes = eqNodesRef.current
    if (nodes && nodes[bandIndex]) {
      nodes[bandIndex].gain.value = Math.max(-12, Math.min(12, gainDb))
    }
  }, [])

  const resetEQ = useCallback(() => {
    const nodes = eqNodesRef.current
    if (nodes) {
      nodes.forEach(n => { n.gain.value = 0 })
    }
  }, [])

  const cleanup = useCallback(() => {
    sourceRef.current?.disconnect()
    gainRef.current?.disconnect()
    eqNodesRef.current?.forEach(n => n.disconnect())
    analyserRef.current?.disconnect()
    destRef.current?.disconnect()
    ctxRef.current?.close()

    sourceRef.current = null
    gainRef.current = null
    eqNodesRef.current = null
    analyserRef.current = null
    destRef.current = null
    mediaStreamRef.current = null
    ctxRef.current = null
  }, [])

  return {
    analyserRef,
    mediaStreamRef,
    eqNodesRef,
    initEngine,
    resumeContext,
    setVolume,
    setEQBand,
    resetEQ,
    cleanup,
  }
}
