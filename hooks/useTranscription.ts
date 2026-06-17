'use client'
import { useRef, useCallback, useState } from 'react'
import { TranscriptEntry } from '@/lib/storage'

// Chunk duration for recording. 4s trades a little RPM headroom for fresher
// audio (lower tail latency). VAD drops silent chunks so the effective request
// rate stays under the ~20 RPM ceiling; bump back to 5000 if 429s reappear.
const CHUNK_DURATION_MS = 4000
// Max request duration before the client aborts. Kept well above the server's
// own Groq timeout (~10s) so a slow-but-working call still lands; a request that
// runs to this limit means the server hung (usually a dead keep-alive socket).
const REQUEST_TIMEOUT_MS = 18000
// Queued audio older than this is dropped instead of transcribed: after any
// stall there's no value in decoding 20s-old speech, and grinding through the
// backlog is exactly what makes the transcript fall further and further behind.
const STALE_CHUNK_MS = 16000
// Rate limit helper: spaces out requests to prevent hitting the 20 RPM limit.
// Kept just under the chunk cadence so spacing never throttles below the
// recording rate (which would force the queue to drop speech).
const MIN_REQUEST_INTERVAL_MS = 3500
// Maximum backlog in queue before discarding oldest
const MAX_QUEUE = 5

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
  language?: string  // ISO-639-1 hint (e.g. 'ko', 'en') — skips Whisper language detection
  onEntry: (entry: TranscriptEntry) => void
  // Patch an already-committed entry by id. Used to fill in the Korean
  // translation asynchronously after the original text is already on screen.
  onEntryUpdate?: (id: string, patch: Partial<TranscriptEntry>) => void
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
  onEntryUpdate,
  onSkipped,
  isTranslatingRef,
}: UseTranscriptionOptions) {
  const [status, setStatus] = useState<TranscribeStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const isRunningRef = useRef(false)
  const sessionIdRef = useRef(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  
  const vadFramesRef = useRef<boolean[]>([])
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Decoupled queue refs
  const blobQueueRef = useRef<{ blob: Blob; recordedAt: number }[]>([])
  const isDrainingRef = useRef(false)
  const lastRequestAtRef = useRef(0)

  // ── VAD ─────────────────────────────────────────────────────────────────
  const startVADSampling = useCallback(() => {
    vadFramesRef.current = []
    if (vadTimerRef.current) clearInterval(vadTimerRef.current)
    vadTimerRef.current = setInterval(() => {
      try {
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
        const hasSpeech = total > 0 && speech / (total || 1) > 0.01
        vadFramesRef.current.push(hasSpeech)
      } catch (e) {
        console.error('Error during VAD sampling:', e)
      }
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

  // ── Transcribe one blob via Groq ──────────────────────────────────────────
  // Transcription only — translation is decoupled (see translateEntry) so the
  // original text reaches the screen without waiting on the LLM round-trip.
  const transcribeBlob = useCallback(
    async (blob: Blob, signal: AbortSignal): Promise<string | null> => {
      const fd = new FormData()
      const ext = blob.type.includes('ogg') ? 'ogg' : 'webm'
      fd.append('audio', blob, `audio.${ext}`)
      if (language) fd.append('language', language)

      const res = await fetch('/api/transcribe', { method: 'POST', body: fd, signal })
      if (!res.ok) {
        if (res.status === 429) {
          const data = await res.json().catch(() => ({}))
          const retryAfter = parseInt(res.headers.get('retry-after') ?? '5', 10)
          throw Object.assign(new Error('rate_limit'), { retryAfter, daily: !!data.daily })
        }
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      const text = typeof data.text === 'string' ? data.text.trim() : ''
      return text || null
    },
    [language]
  )

  // ── Translate one entry asynchronously ────────────────────────────────────
  // Fire-and-forget: never blocks the transcription drain loop. Hits a separate
  // chat-model endpoint (own rate budget), then patches the entry in place.
  const translateEntry = useCallback(
    async (id: string, text: string) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        const translation = typeof data.translation === 'string' ? data.translation.trim() : ''
        if (translation) onEntryUpdate?.(id, { translation })
      } catch {
        /* translation is best-effort; ignore failures so subtitles keep flowing */
      } finally {
        clearTimeout(timeoutId)
      }
    },
    [onEntryUpdate]
  )

  // ── Start / Stop ──────────────────────────────────────────────────────────
  const startTranscription = useCallback(() => {
    if (isRunningRef.current) return
    isRunningRef.current = true
    sessionIdRef.current++
    setErrorMessage('')
    setStatus('receiving')

    blobQueueRef.current = []
    isDrainingRef.current = false
    const mySession = sessionIdRef.current

    // Continuous recording loop: chains recursively without pausing
    const scheduleChunk = () => {
      if (!isRunningRef.current || sessionIdRef.current !== mySession) return

      const stream = mediaStreamRef.current
      if (!stream) {
        // Stream not ready yet (e.g. channel switching) — retry in 1s
        setTimeout(scheduleChunk, 1000)
        return
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg'

      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 })
      } catch {
        try {
          recorder = new MediaRecorder(stream)
        } catch (e) {
          console.error('Failed to create MediaRecorder:', e)
          setTimeout(scheduleChunk, 1000)
          return
        }
      }
      recorderRef.current = recorder

      const localChunks: Blob[] = []
      let resolved = false
      const chainNext = () => {
        if (resolved) return
        resolved = true
        clearTimeout(safetyTimeout)
        clearTimeout(stopTimeout)
        if (isRunningRef.current && sessionIdRef.current === mySession) {
          scheduleChunk()
        }
      }

      recorder.ondataavailable = e => {
        if (e.data.size > 0) localChunks.push(e.data)
      }

      recorder.onstop = () => {
        if (!isRunningRef.current || sessionIdRef.current !== mySession) return

        try {
          const blob = new Blob(localChunks, { type: mimeType })
          const hasSpeech = stopVADAndEvaluate()

          if (hasSpeech) {
            if (blobQueueRef.current.length >= MAX_QUEUE) {
              blobQueueRef.current.shift()
            }
            blobQueueRef.current.push({ blob, recordedAt: Date.now() })
            drainQueue()
          } else {
            onSkipped()
            if (blobQueueRef.current.length === 0 && !isDrainingRef.current) {
              setStatus('skipped')
            }
          }
        } catch (e) {
          console.error('Error processing recorded chunk:', e)
        }
        chainNext()
      }

      recorder.onerror = e => {
        console.error('MediaRecorder error:', e)
        chainNext()
      }

      startVADSampling()
      try {
        recorder.start()
      } catch (e) {
        console.error('Failed to start MediaRecorder:', e)
        chainNext()
        return
      }

      const stopTimeout = setTimeout(() => {
        try {
          if (recorder.state !== 'inactive') {
            recorder.stop()
          } else {
            chainNext()
          }
        } catch (e) {
          console.error('Failed to stop MediaRecorder:', e)
          chainNext()
        }
      }, CHUNK_DURATION_MS)

      // Safety net: in case neither onstop nor onerror fires
      const safetyTimeout = setTimeout(() => {
        console.warn('MediaRecorder safety timeout triggered')
        chainNext()
      }, CHUNK_DURATION_MS + 2000)
    }

    // Continuous async queue draining loop: runs serially, decoupled from recording
    const drainQueue = async () => {
      if (isDrainingRef.current) return
      isDrainingRef.current = true

      while (
        blobQueueRef.current.length > 0 &&
        isRunningRef.current &&
        sessionIdRef.current === mySession
      ) {
        // Discard stale audio before spending a request (or the spacing wait) on
        // it — this is what lets the pipeline snap back to live after a hang
        // instead of slowly chewing through a backlog of outdated chunks.
        while (
          blobQueueRef.current.length > 0 &&
          Date.now() - blobQueueRef.current[0].recordedAt > STALE_CHUNK_MS
        ) {
          blobQueueRef.current.shift()
        }
        if (blobQueueRef.current.length === 0) break

        // Enforce spacing to prevent hitting rate limits
        const sinceLastMs = Date.now() - lastRequestAtRef.current
        if (sinceLastMs < MIN_REQUEST_INTERVAL_MS) {
          await new Promise(r => setTimeout(r, MIN_REQUEST_INTERVAL_MS - sinceLastMs))
          if (!isRunningRef.current || sessionIdRef.current !== mySession) break
        }

        const item = blobQueueRef.current.shift()!
        const { blob } = item
        setStatus('transcribing')

        const controller = new AbortController()
        abortRef.current = controller
        lastRequestAtRef.current = Date.now()

        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

        try {
          const text = await transcribeBlob(blob, controller.signal)
          if (text && isRunningRef.current && sessionIdRef.current === mySession) {
            setErrorMessage('')   // recovered — clear any quota/rate-limit notice
            const now = new Date()
            const ts = [
              now.getHours().toString().padStart(2, '0'),
              now.getMinutes().toString().padStart(2, '0'),
              now.getSeconds().toString().padStart(2, '0'),
            ].join(':')
            const id = `${channelId}-${Date.now()}`
            onEntry({ id, timestamp: ts, channelId, channelName, text })
            // Kick off translation without blocking the next chunk; it patches
            // the entry in place once the Korean text comes back.
            if (isTranslatingRef.current) void translateEntry(id, text)
          }
          if (isRunningRef.current && sessionIdRef.current === mySession) {
            setStatus('receiving')
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            if (isRunningRef.current && sessionIdRef.current === mySession) {
              setStatus('receiving')
            }
            continue // proceed to next backlog chunk
          }
          if (!isRunningRef.current || sessionIdRef.current !== mySession) break

          const { retryAfter, daily } = err as { retryAfter?: number; daily?: boolean }
          setStatus('error')

          if (err instanceof Error && err.message === 'rate_limit') {
            if (daily) {
              setErrorMessage(
                '오늘 무료 전사 한도를 모두 사용했어요. UTC 자정에 초기화되며, 그때 자동으로 다시 시작됩니다.'
              )
            }
            // Put the item back to front and wait, adding a 2s safety buffer
            blobQueueRef.current.unshift(item)
            const waitMs = Math.min((retryAfter ?? 10) + 2, 60) * 1000
            await new Promise(r => setTimeout(r, waitMs))
          } else {
            // Permanent/hard error (e.g. 500, 400, API key revoked) -> Drop chunk to prevent blocking the queue.
            console.error('Transcription hard error (chunk dropped):', err)
            // Wait 1.5 seconds to cool down before continuing
            await new Promise(r => setTimeout(r, 1500))
          }

          if (isRunningRef.current && sessionIdRef.current === mySession) {
            setStatus('receiving')
          }
        } finally {
          clearTimeout(timeoutId)
          abortRef.current = null
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
    translateEntry,
    isTranslatingRef,
    channelId,
    channelName,
    onEntry,
    onSkipped,
  ])

  const stopTranscription = useCallback(() => {
    isRunningRef.current = false
    sessionIdRef.current++          // invalidate any in-flight results
    abortRef.current?.abort()
    abortRef.current = null
    blobQueueRef.current = []
    isDrainingRef.current = false
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current)
      vadTimerRef.current = null
    }
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
    setErrorMessage('')
    setStatus('idle')
  }, [])

  return { status, errorMessage, startTranscription, stopTranscription }
}
