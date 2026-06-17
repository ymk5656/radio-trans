'use client'
import { useEffect, useState } from 'react'
import { TranscriptEntry as TEntry } from '@/lib/storage'

interface TranscriptEntryProps {
  entry: TEntry
  isLatest: boolean
  fontSize: number
  // Station name is only shown when it differs from the previous entry, so it
  // appears once at the top of each station's run instead of on every line.
  showChannel: boolean
}

// Reveal the latest entry character-by-character so a 4–5s audio chunk reads as
// a steady stream of words rather than a block that pops in all at once. The
// full text is rendered immediately (kept transparent) so the row reserves its
// final height up front — the layout never reflows mid-reveal, which means the
// panel's auto-scroll stays pinned without any per-tick scroll wrangling.
function useTypewriter(text: string, animate: boolean): number {
  const [revealed, setRevealed] = useState(animate ? 0 : text.length)

  useEffect(() => {
    const total = text.length
    if (!animate || total === 0) {
      setRevealed(total)
      return
    }
    // Spread the reveal over ~3s (a touch under the chunk cadence) so words are
    // still arriving when the next chunk lands — clamped so very short lines
    // aren't sluggish and very long ones don't crawl.
    const stepMs = Math.min(90, Math.max(14, Math.round(3000 / total)))
    const charsPerStep = total > 200 ? 2 : 1
    setRevealed(0)
    let i = 0
    const timer = setInterval(() => {
      i += charsPerStep
      if (i >= total) {
        setRevealed(total)
        clearInterval(timer)
        return
      }
      setRevealed(i)
    }, stepMs)
    return () => clearInterval(timer)
    // `text` is the dep (not entry identity): a translation patch keeps the same
    // text string, so it won't restart the reveal; a genuinely new line will.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, text])

  return revealed
}

export function TranscriptEntryRow({
  entry,
  isLatest,
  fontSize,
  showChannel,
}: TranscriptEntryProps) {
  const revealed = useTypewriter(entry.text, isLatest)
  const revealDone = !isLatest || revealed >= entry.text.length

  const shown = revealDone ? entry.text : entry.text.slice(0, revealed)
  const rest = revealDone ? '' : entry.text.slice(revealed)

  return (
    <div
      className={`
        px-3 py-2.5 border-b border-[#2e2e2e]
        transition-colors duration-150 hover:bg-white/[0.02]
        ${isLatest
          ? 'border-l-2 border-l-green-500 bg-green-500/[0.05] entry-appear'
          : 'border-l-2 border-l-transparent'
        }
      `}
    >
      {/* Header: timestamp + (channel only when it changes) */}
      <div className="flex items-baseline gap-1.5 mb-0.5">
        <span
          className="text-[#4a4a4a] font-mono tabular-nums flex-shrink-0"
          style={{ fontSize: fontSize * 0.78 }}
        >
          {entry.timestamp}
        </span>
        {showChannel && (
          <span
            className="text-green-500/80 font-semibold flex-shrink-0"
            style={{ fontSize: fontSize * 0.82 }}
          >
            {entry.channelName.split(' ')[0]}
          </span>
        )}
      </div>

      {/* Transcript text — `rest` stays in the DOM but invisible so the row keeps
          its full height while the visible portion types in. */}
      <span className="text-[#ddd] leading-relaxed" style={{ fontSize }}>
        {shown}
        {rest && <span className="opacity-0">{rest}</span>}
      </span>

      {/* Korean translation — held back until the original finishes revealing so
          it doesn't pop in mid-typewriter. */}
      {entry.translation && revealDone && (
        <div
          className="mt-1.5 pl-2.5 border-l border-blue-500/30 text-blue-300/70 italic leading-relaxed"
          style={{ fontSize: fontSize * 0.92 }}
        >
          {entry.translation}
        </div>
      )}
    </div>
  )
}
