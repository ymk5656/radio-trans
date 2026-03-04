'use client'
import { useRef, useCallback } from 'react'

const SPEECH_LOW_HZ = 300
const SPEECH_HIGH_HZ = 3400
const SPEECH_RATIO_THRESHOLD = 0.15
const ENERGY_THRESHOLD = 0.01
const POLL_INTERVAL_MS = 100

export function useVAD(analyserRef: React.RefObject<AnalyserNode | null>) {
  const framesRef = useRef<boolean[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startSampling = useCallback(() => {
    framesRef.current = []
    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      const analyser = analyserRef.current
      if (!analyser) return

      const sampleRate = analyser.context.sampleRate
      const fftSize = analyser.fftSize
      const binCount = analyser.frequencyBinCount
      const data = new Uint8Array(binCount)
      analyser.getByteFrequencyData(data)

      // Calculate which bins correspond to speech frequencies
      const lowBin = Math.floor((SPEECH_LOW_HZ * fftSize) / sampleRate)
      const highBin = Math.ceil((SPEECH_HIGH_HZ * fftSize) / sampleRate)

      let speechEnergy = 0
      let totalEnergy = 0

      for (let i = 0; i < binCount; i++) {
        const val = data[i] / 255
        totalEnergy += val
        if (i >= lowBin && i <= highBin) {
          speechEnergy += val
        }
      }

      const isSpeechFrame =
        totalEnergy > 0 &&
        speechEnergy / (totalEnergy || 1) > ENERGY_THRESHOLD
      framesRef.current.push(isSpeechFrame)
    }, POLL_INTERVAL_MS)
  }, [analyserRef])

  const stopSamplingAndEvaluate = useCallback((): boolean => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    const frames = framesRef.current
    if (frames.length === 0) return false

    const speechFrames = frames.filter(Boolean).length
    const ratio = speechFrames / frames.length
    framesRef.current = []
    return ratio >= SPEECH_RATIO_THRESHOLD
  }, [])

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    framesRef.current = []
  }, [])

  return { startSampling, stopSamplingAndEvaluate, cleanup }
}
