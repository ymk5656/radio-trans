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

const STORAGE_VERSION = 3  // bumped: removed KCRW/KPCC/KQED/WBEZ dead channels

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
    return JSON.parse(raw) as Channel[]
  } catch {
    return DEFAULT_CHANNELS
  }
}

export function saveChannels(channels: Channel[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(CHANNELS_KEY, JSON.stringify(channels))
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
  const capped = entries.slice(-500)
  localStorage.setItem(TRANSCRIPTS_KEY, JSON.stringify(capped))
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
  localStorage.setItem(EQ_KEY, JSON.stringify(gains))
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
