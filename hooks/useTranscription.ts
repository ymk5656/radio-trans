'use client'
import { useRef, useCallback, useState } from 'react'
import { TranscriptEntry } from '@/lib/storage'

// 5 seconds for near-realtime feel; Groq inference is fast (~0.3-0.5s)
const CHUNK_DURATION_MS = 5000

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
  onEntry: (entry: TranscriptEntry) => void
  onSkipped: () => void
  isTranslatingRef: React.RefObject<boolean>  // mutable ref — avoids stale closure in loop
}

export function useTranscription({
  mediaStreamRef,
  analyserRef,
  channelId,
  channelName,
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
        recorder = new MediaRecorder(stream, { mimeType })
      } catch {
        recorder = new MediaRecorder(stream)
      }
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        resolve(blob)
      }

      recorder.onerror = () => resolve(null)

      startVADSampling()
      recorder.start()

      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop()
        }
      }, CHUNK_DURATION_MS)
    })
  }, [mediaStreamRef, startVADSampling])

  const transcribeBlob = useCallback(
    async (blob: Blob): Promise<{ text: string; translation?: string } | null> => {
      const fd = new FormData()
      const ext = blob.type.includes('ogg') ? 'ogg' : 'webm'
      fd.append('audio', blob, `audio.${ext}`)
      // Read translate from ref — reflects latest toggle without stale closure
      if (isTranslatingRef.current) fd.append('translate', 'true')

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
    [isTranslatingRef]
  )

  const loop = useCallback(async () => {
    while (isRunningRef.current) {
      setStatus('receiving')

      const blob = await recordChunk()
      if (!blob || !isRunningRef.current) break

      const hasSpeech = stopVADAndEvaluate()

      if (!hasSpeech) {
        setStatus('skipped')
        onSkipped()
        await new Promise(r => setTimeout(r, 200))
        continue
      }

      setStatus('transcribing')
      try {
        const result = await transcribeBlob(blob)
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

  return {
    status,
    startTranscription,
    stopTranscription,
  }
}
