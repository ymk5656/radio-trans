import { Channel, DEFAULT_CHANNELS } from './channels'

const CHANNELS_KEY = 'radio-trans:channels'
const TRANSCRIPTS_KEY = 'radio-trans:transcripts'

export interface TranscriptEntry {
  id: string
  timestamp: string
  channelName: string
  channelId: string
  text: string
  translation?: string
}

const STORAGE_VERSION = 6  // bumped: moved Al Jazeera to recommended-only (out of defaults)

export function loadChannels(): Channel[] {
  if (typeof window === 'undefined') return DEFAULT_CHANNELS
  try {
    const version = parseInt(localStorage.getItem('radio-trans:version') ?? '0', 10)
    if (version < STORAGE_VERSION) {
      localStorage.setItem('radio-trans:version', String(STORAGE_VERSION))
      localStorage.removeItem(CHANNELS_KEY)
      return DEFAULT_CHANNELS
    }
    const raw = localStorage.getItem(CHANNELS_KEY)
    if (!raw) return DEFAULT_CHANNELS
    const parsed = JSON.parse(raw) as Channel[]
    // If somehow an empty array was persisted, fall back to defaults
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_CHANNELS
    return parsed
  } catch {
    return DEFAULT_CHANNELS
  }
}

export function saveChannels(channels: Channel[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CHANNELS_KEY, JSON.stringify(channels))
  } catch (e) {
    console.error('Failed to save channels:', e)
  }
}

export function loadTranscripts(): TranscriptEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(TRANSCRIPTS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as TranscriptEntry[]
  } catch {
    return []
  }
}

export function saveTranscripts(entries: TranscriptEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    const capped = entries.slice(-500)
    localStorage.setItem(TRANSCRIPTS_KEY, JSON.stringify(capped))
  } catch (e) {
    console.error('Failed to save transcripts:', e)
  }
}

// ── EQ persistence ──────────────────────────────────────────────
const EQ_KEY = 'radio-trans:eq_gains'
const EQ_BANDS = 10

export function loadEQGains(): number[] {
  if (typeof window === 'undefined') return new Array(EQ_BANDS).fill(0)
  try {
    const raw = localStorage.getItem(EQ_KEY)
    if (!raw) return new Array(EQ_BANDS).fill(0)
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length === EQ_BANDS) return parsed
  } catch { /* ignore */ }
  return new Array(EQ_BANDS).fill(0)
}

export function saveEQGains(gains: number[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(EQ_KEY, JSON.stringify(gains))
  } catch (e) {
    console.error('Failed to save EQ gains:', e)
  }
}

// ── Playback delay persistence ────────────────────────────────────
// v2: bumped so stale pre-3.0-default values are dropped and everyone
// starts from the new 3.0 default.
const DELAY_KEY = 'radio-trans:playback_delay_v2'

export function getPlaybackDelay(): number {
  if (typeof window === 'undefined') return 3.0
  const raw = localStorage.getItem(DELAY_KEY)
  if (raw === null) return 3.0
  const val = parseFloat(raw)
  return isNaN(val) ? 3.0 : Math.max(0, Math.min(5, val))
}

export function savePlaybackDelay(seconds: number): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DELAY_KEY, String(Math.max(0, Math.min(5, seconds))))
  } catch (e) {
    console.error('Failed to save playback delay:', e)
  }
}

export function exportTranscriptsAsTxt(entries: TranscriptEntry[]): void {
  const text = entries
    .map(e => {
      let line = `[${e.timestamp}] ${e.channelName}: ${e.text}`
      if (e.translation) line += `\n  [번역] ${e.translation}`
      return line
    })
    .join('\n')
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `transcripts-${new Date().toISOString().slice(0, 10)}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
