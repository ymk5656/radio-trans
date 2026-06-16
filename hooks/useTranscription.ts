'use client'
import { useRef, useCallback, useState } from 'react'
import { TranscriptEntry } from '@/lib/storage'

const CHUNK_DURATION_MS = 3300
// How many blobs to buffer during Groq slow-downs before dropping the oldest.
// 4 × 3.3s = 13.2s of backlog tolerated.
const MAX_QUEUE = 4
// Groq free tier: 20 RPM. 3.3s interval ≈ 18.2 RPM — safely under the limit.
const MIN_REQUEST_INTERVAL_MS = 3300

export type TranscribeStatus =
  | 'idle'
  | 'receiving'
  | 'transcribing'
  | 'skipped'
  | 'error'

interface UseTranscriptionOptions {
  mediaStreamRef: React.RefObject<MediaStream | null>
  analyserRef: React.RefObject<AnalyserNode | null>
  channelId: string
  channelName: string
  language?: string
  onEntry: (entry: TranscriptEntry) => void
  onSkipped: () => void
  isTranslatingRef: React.RefObject<boolean>
  /** Reports end-to-end latency (seconds) per successful chunk — used for auto-sync. */
  onLatency?: (seconds: number) => void
}

export function useTranscription({
  mediaStreamRef,
  analyserRef,
  channelId,
  channelName,
  language,
  onEntry,
  onSkipped,
  isTranslatingRef,
  onLatency,
}: UseTranscriptionOptions) {
  const [status, setStatus] = useState<TranscribeStatus>('idle')

  const isRunningRef      = useRef(false)
  const sessionIdRef      = useRef(0)
  const recorderRef       = useRef<MediaRecorder | null>(null)
  const vadFramesRef      = useRef<boolean[]>([])
  const vadTimerRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef          = useRef<AbortController | null>(null)
  const blobQueueRef      = useRef<{ blob: Blob; recordedAt: number }[]>([])
  const isDrainingRef     = useRef(false)
  const lastRequestAtRef  = useRef<number>(0)   // tracks last Groq call time for throttling

  // ── VAD ───────────────────────────────────────────────────────────────────
  const startVADSampling = useCallback(() => {
    vadFramesRef.current = []
    if (vadTimerRef.current) clearInterval(vadTimerRef.current)
    vadTimerRef.current = setInterval(() => {
      const analyser = analyserRef.current
      if (!analyser) return
      const binCount = analyser.frequencyBinCount
      const data = new Uint8Array(binCount)
      analyser.getByteFrequencyData(data)
      const sampleRate = analyser.context.sampleRate
      const fftSize = analyser.fftSize
      const lowBin = Math.floor((300 * fftSize) / sampleRate)
      const highBin = Math.ceil((3400 * fftSize) / sampleRate)
      let speech = 0, total = 0
      for (let i = 0; i < binCount; i++) {
        const v = data[i] / 255
        total += v
        if (i >= lowBin && i <= highBin) speech += v
      }
      vadFramesRef.current.push(total > 0 && speech / (total || 1) > 0.01)
    }, 100)
  }, [analyserRef])

  const stopVADAndEvaluate = useCallback((): boolean => {
    if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null }
    const frames = vadFramesRef.current
    vadFramesRef.current = []
    if (frames.length === 0) return false
    return frames.filter(Boolean).length / frames.length >= 0.15
  }, [])

  // ── Transcribe one blob via Groq ──────────────────────────────────────────
  const transcribeBlob = useCallback(
    async (
      blob: Blob,
      signal: AbortSignal
    ): Promise<{ text: string; translation?: string } | null> => {
      const fd = new FormData()
      const ext = blob.type.includes('ogg') ? 'ogg' : 'webm'
      fd.append('audio', blob, `audio.${ext}`)
      if (isTranslatingRef.current) fd.append('translate', 'true')
      if (language) fd.append('language', language)

      const res = await fetch('/api/transcribe', { method: 'POST', body: fd, signal })
      if (!res.ok) {
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('retry-after') ?? '5', 10)
          throw Object.assign(new Error('rate_limit'), { retryAfter })
        }
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      const text = typeof data.text === 'string' ? data.text.trim() : ''
      if (!text) return null
      return { text, translation: data.translation }
    },
    [isTranslatingRef, language]
  )

  // ── Start ─────────────────────────────────────────────────────────────────
  const startTranscription = useCallback(() => {
    if (isRunningRef.current) return
    isRunningRef.current = true
    sessionIdRef.current++          // new session — invalidates any stale results
    blobQueueRef.current = []
    isDrainingRef.current = false
    setStatus('receiving')

    const mySession = sessionIdRef.current

    // ── Recording loop ───────────────────────────────────────────────────
    // Runs INDEPENDENTLY of transcription. Next chunk starts the instant the
    // current recorder fires onstop — no gap regardless of API latency.
    function scheduleChunk() {
      if (!isRunningRef.current || mySession !== sessionIdRef.current) return
      const stream = mediaStreamRef.current
      if (!stream) return

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'

      const localChunks: Blob[] = []
      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 })
      } catch {
        recorder = new MediaRecorder(stream)
      }
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => { if (e.data.size > 0) localChunks.push(e.data) }

      recorder.onstop = () => {
        // Bail out if stopped or channel switched
        if (!isRunningRef.current || mySession !== sessionIdRef.current) return

        const blob = new Blob(localChunks, { type: mimeType })
        const hasSpeech = stopVADAndEvaluate()

        if (hasSpeech) {
          // Drop the oldest if backlog is too deep (Groq outage scenario)
          if (blobQueueRef.current.length >= MAX_QUEUE) blobQueueRef.current.shift()
          // recordedAt = chunk-end wall-clock; latency is measured against this
          blobQueueRef.current.push({ blob, recordedAt: Date.now() })
          drainQueue()             // no-op if already draining
        } else {
          setStatus('skipped')
          onSkipped()
        }

        // ↓ Immediately chain the next recording — ZERO intentional gap
        scheduleChunk()
      }

      startVADSampling()
      recorder.start()
      setTimeout(() => { if (recorder.state === 'recording') recorder.stop() }, CHUNK_DURATION_MS)
    }

    // ── Transcription drain loop ─────────────────────────────────────────
    // Runs as a serial async queue, completely decoupled from recording.
    // Even if Groq takes 5 s, scheduleChunk keeps running without pause.
    async function drainQueue() {
      if (isDrainingRef.current) return   // already processing
      isDrainingRef.current = true

      while (
        blobQueueRef.current.length > 0 &&
        isRunningRef.current &&
        mySession === sessionIdRef.current
      ) {
        // ── Rate throttle: enforce minimum interval to stay under 20 RPM ──
        const sinceLastMs = Date.now() - lastRequestAtRef.current
        if (sinceLastMs < MIN_REQUEST_INTERVAL_MS) {
          await new Promise(r => setTimeout(r, MIN_REQUEST_INTERVAL_MS - sinceLastMs))
          if (!isRunningRef.current || mySession !== sessionIdRef.current) break
        }

        const item = blobQueueRef.current.shift()!
        const { blob, recordedAt } = item
        setStatus('transcribing')

        const controller = new AbortController()
        abortRef.current = controller
        lastRequestAtRef.current = Date.now()

        try {
          const result = await transcribeBlob(blob, controller.signal)
          if (result && isRunningRef.current && mySession === sessionIdRef.current) {
            // End-to-end latency: chunk-end → subtitle ready. Drives auto-sync.
            onLatency?.((Date.now() - recordedAt) / 1000)
            const now = new Date()
            const ts = [
              now.getHours().toString().padStart(2, '0'),
              now.getMinutes().toString().padStart(2, '0'),
              now.getSeconds().toString().padStart(2, '0'),
            ].join(':')
            onEntry({
              id: `${channelId}-${Date.now()}`,
              timestamp: ts,
              channelId,
              channelName,
              text: result.text,
              translation: result.translation,
            })
          }
          if (mySession === sessionIdRef.current && isRunningRef.current) setStatus('receiving')
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') break   // cancelled — exit

          const retryAfter = (err as { retryAfter?: number }).retryAfter
          if (mySession === sessionIdRef.current) {
            setStatus('error')
            // Put the blob back at the front so it gets retried (not dropped)
            blobQueueRef.current.unshift(item)
            // Wait out the rate limit (recording continues unaffected)
            await new Promise(r => setTimeout(r, (retryAfter ?? 10) * 1000))
            if (mySession === sessionIdRef.current && isRunningRef.current) setStatus('receiving')
          }
        }
      }

      isDrainingRef.current = false
    }

    scheduleChunk()
  }, [
    mediaStreamRef,
    startVADSampling,
    stopVADAndEvaluate,
    transcribeBlob,
    channelId,
    channelName,
    onEntry,
    onSkipped,
    onLatency,
  ])

  // ── Stop ──────────────────────────────────────────────────────────────────
  const stopTranscription = useCallback(() => {
    isRunningRef.current = false
    sessionIdRef.current++          // immediately invalidate this session
    abortRef.current?.abort()
    abortRef.current = null
    blobQueueRef.current = []
    isDrainingRef.current = false
    if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null }
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    setStatus('idle')
  }, [])

  return { status, startTranscription, stopTranscription }
}
