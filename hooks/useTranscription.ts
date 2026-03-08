'use client'
import { useRef, useCallback, useState } from 'react'
import { TranscriptEntry } from '@/lib/storage'

const CHUNK_DURATION_MS = 2500

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
}: UseTranscriptionOptions) {
  const [status, setStatus] = useState<TranscribeStatus>('idle')
  const isRunningRef = useRef(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const vadFramesRef = useRef<boolean[]>([])
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // ── Session ID: incremented on each startTranscription call ──────────────
  // Prevents old in-flight results from a previous channel from being added.
  const sessionIdRef = useRef(0)
  // ── AbortController for the current in-flight fetch ───────────────────────
  const abortControllerRef = useRef<AbortController | null>(null)

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
      let speech = 0
      let total = 0
      for (let i = 0; i < binCount; i++) {
        const v = data[i] / 255
        total += v
        if (i >= lowBin && i <= highBin) speech += v
      }
      vadFramesRef.current.push(total > 0 && speech / (total || 1) > 0.01)
    }, 100)
  }, [analyserRef])

  const stopVADAndEvaluate = useCallback((): boolean => {
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current)
      vadTimerRef.current = null
    }
    const frames = vadFramesRef.current
    if (frames.length === 0) return false
    const ratio = frames.filter(Boolean).length / frames.length
    vadFramesRef.current = []
    return ratio >= 0.15
  }, [])

  const recordChunk = useCallback((): Promise<Blob | null> => {
    return new Promise(resolve => {
      const stream = mediaStreamRef.current
      if (!stream) return resolve(null)

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg'

      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 })
      } catch {
        recorder = new MediaRecorder(stream)
      }
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeType }))
      recorder.onerror = () => resolve(null)

      startVADSampling()
      recorder.start()
      setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, CHUNK_DURATION_MS)
    })
  }, [mediaStreamRef, startVADSampling])

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
          // Rate limit — surface retry-after so the loop can back off correctly
          const retryAfter = parseInt(res.headers.get('retry-after') ?? '5', 10)
          const err = Object.assign(new Error('rate_limit'), { retryAfter })
          throw err
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

  const loop = useCallback(async () => {
    // Capture session ID at loop start — any result from a previous session
    // will fail the guard check and be discarded.
    const mySession = sessionIdRef.current
    let pendingTranscription: Promise<void> | null = null

    while (isRunningRef.current && mySession === sessionIdRef.current) {
      setStatus('receiving')

      const blob = await recordChunk()
      if (!blob || !isRunningRef.current || mySession !== sessionIdRef.current) break

      const hasSpeech = stopVADAndEvaluate()

      if (!hasSpeech) {
        setStatus('skipped')
        onSkipped()
        continue
      }

      // Wait for previous transcription (virtually instant with Groq + 2.5s chunks)
      if (pendingTranscription) {
        await pendingTranscription
        pendingTranscription = null
      }
      if (!isRunningRef.current || mySession !== sessionIdRef.current) break

      setStatus('transcribing')

      const capturedBlob = blob
      const controller = new AbortController()
      abortControllerRef.current = controller

      pendingTranscription = (async () => {
        try {
          const result = await transcribeBlob(capturedBlob, controller.signal)
          // Double-check: only add entry if this is still the active session
          if (result && isRunningRef.current && mySession === sessionIdRef.current) {
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
        } catch (err) {
          // AbortError = cancelled intentionally (channel switch / stop) — silent
          if (err instanceof Error && err.name === 'AbortError') return

          const retryAfter = (err as { retryAfter?: number }).retryAfter

          if (mySession === sessionIdRef.current) {
            setStatus('error')
            if (retryAfter) {
              // Groq rate limit: wait the server-specified duration
              await new Promise(r => setTimeout(r, retryAfter * 1000))
            } else {
              await new Promise(r => setTimeout(r, 2000))
            }
          }
        }
      })()
      // ↑ NOT awaited — recording starts immediately for the next chunk
    }

    if (pendingTranscription) await pendingTranscription
    // Only reset status if this session is still the active one
    if (mySession === sessionIdRef.current) setStatus('idle')
  }, [
    recordChunk,
    stopVADAndEvaluate,
    transcribeBlob,
    channelId,
    channelName,
    onEntry,
    onSkipped,
  ])

  const startTranscription = useCallback(() => {
    if (isRunningRef.current) return
    isRunningRef.current = true
    sessionIdRef.current++   // invalidates all previous sessions
    loop()
  }, [loop])

  const stopTranscription = useCallback(() => {
    isRunningRef.current = false
    // Cancel any in-flight API request immediately — prevents stale results
    // from appearing after the channel has changed.
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current)
      vadTimerRef.current = null
    }
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
    setStatus('idle')
  }, [])

  return { status, startTranscription, stopTranscription }
}
