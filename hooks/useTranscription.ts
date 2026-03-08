'use client'
import { useRef, useCallback, useState } from 'react'
import { TranscriptEntry } from '@/lib/storage'

// 2.5s chunks: text appears ~2× more frequently than the old 5s
// Groq inference is ~0.3-0.5s, well within one chunk period
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
  language?: string  // ISO-639-1 hint (e.g. 'ko', 'en') — skips Whisper language detection
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
      const hasSpeech = total > 0 && speech / (total || 1) > 0.01
      vadFramesRef.current.push(hasSpeech)
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
        // 32 kbps is plenty for speech recognition — 4× smaller than default 128 kbps
        recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 })
      } catch {
        recorder = new MediaRecorder(stream)
      }
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: mimeType }))
      }
      recorder.onerror = () => resolve(null)

      startVADSampling()
      recorder.start()

      setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, CHUNK_DURATION_MS)
    })
  }, [mediaStreamRef, startVADSampling])

  const transcribeBlob = useCallback(
    async (blob: Blob): Promise<{ text: string; translation?: string } | null> => {
      const fd = new FormData()
      const ext = blob.type.includes('ogg') ? 'ogg' : 'webm'
      fd.append('audio', blob, `audio.${ext}`)
      if (isTranslatingRef.current) fd.append('translate', 'true')
      if (language) fd.append('language', language)

      const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Transcription failed')
      }
      const data = await res.json()
      const text = typeof data.text === 'string' ? data.text.trim() : ''
      if (!text) return null
      return { text, translation: data.translation }
    },
    [isTranslatingRef, language]
  )

  const loop = useCallback(async () => {
    // pendingTranscription holds the in-flight API call for the previous chunk.
    // Recording the NEXT chunk starts immediately — the two run in parallel.
    // We only await the previous call before firing the next one, which is
    // virtually instant since Groq (~0.3 s) finishes long before 2.5 s elapse.
    let pendingTranscription: Promise<void> | null = null

    while (isRunningRef.current) {
      setStatus('receiving')

      // ── Record next chunk (2.5 s) ─────────────────────────────────────────
      // While this is happening, any previous transcription is running in
      // parallel on the server — free pipeline overlap.
      const blob = await recordChunk()
      if (!blob || !isRunningRef.current) break

      const hasSpeech = stopVADAndEvaluate()

      if (!hasSpeech) {
        setStatus('skipped')
        onSkipped()
        // No artificial delay — next recording starts immediately
        continue
      }

      // ── Await previous transcription (nearly always already done) ─────────
      if (pendingTranscription) {
        await pendingTranscription
        pendingTranscription = null
      }
      if (!isRunningRef.current) break

      setStatus('transcribing')

      // ── Fire transcription and immediately loop to start recording ─────────
      const capturedBlob = blob
      pendingTranscription = (async () => {
        try {
          const result = await transcribeBlob(capturedBlob)
          if (result && isRunningRef.current) {
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
          const msg = err instanceof Error ? err.message : 'Unknown error'
          console.error('Transcription error:', msg)
          setStatus('error')
          await new Promise(r => setTimeout(r, 2000))
        }
      })()
      // ↑ intentionally NOT awaited — loop immediately continues to record next chunk
    }

    // Drain the last in-flight transcription before exiting
    if (pendingTranscription) {
      setStatus('transcribing')
      await pendingTranscription
    }
    setStatus('idle')
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
    loop()
  }, [loop])

  const stopTranscription = useCallback(() => {
    isRunningRef.current = false
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
