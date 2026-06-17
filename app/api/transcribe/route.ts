import { NextRequest } from 'next/server'
import Groq from 'groq-sdk'

export const runtime = 'nodejs'

// ── Multi-key support ───────────────────────────────────────────────────────
// Free Groq keys have a daily quota. Configure one or more keys; when the
// active key's daily quota is exhausted we fail over to the next one. Keys are
// read from GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3 (and a comma-separated
// GROQ_API_KEYS, for convenience). Empty/duplicate entries are ignored.
function getKeys(): string[] {
  const raw = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    ...(process.env.GROQ_API_KEYS?.split(',') ?? []),
  ]
  const seen = new Set<string>()
  const keys: string[] = []
  for (const k of raw) {
    const key = k?.trim()
    if (key && !seen.has(key)) { seen.add(key); keys.push(key) }
  }
  return keys
}

// Cache one SDK client per key — avoids re-instantiating on every request.
const _clients = new Map<string, Groq>()
function getGroq(apiKey: string): Groq {
  let c = _clients.get(apiKey)
  if (!c) { c = new Groq({ apiKey }); _clients.set(apiKey, c) }
  return c
}

// Index of the key we currently believe is usable. Persisted at module scope so
// once a key is daily-exhausted, later requests start from the next one instead
// of wasting a failed call on the dead key every time.
let currentKeyIndex = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errDetail(groqErr: any): string {
  return groqErr?.error?.error?.message || groqErr?.error?.message || groqErr?.message || ''
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isDailyLimit(groqErr: any): boolean {
  if (groqErr?.status !== 429) return false
  return /per day|\bday\b|RPD|ASD|TPD/i.test(errDetail(groqErr))
}

export async function POST(req: NextRequest) {
  const keys = getKeys()
  if (keys.length === 0) {
    return Response.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return Response.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const audio = formData.get('audio') as File | null
  if (!audio) {
    return Response.json({ error: 'Missing audio file' }, { status: 400 })
  }

  const translate = formData.get('translate') === 'true'
  const language = (formData.get('language') as string | null) || undefined

  // One transcription (+ optional translation) attempt against a single key.
  async function attempt(apiKey: string) {
    const groq = getGroq(apiKey)

    // whisper-large-v3-turbo: best speed/accuracy trade-off on Groq
    // language hint skips auto-detection (~50-100 ms saved per request)
    const transcription = await groq.audio.transcriptions.create({
      file: audio!,
      model: 'whisper-large-v3-turbo',
      response_format: 'text',
      ...(language ? { language } : {}),
    }, {
      // A 4s clip decodes in ~1-2s; anything past 10s means a dead/stalled
      // keep-alive socket, so fail fast (no retries) and let the next request
      // open a fresh connection instead of hanging for the SDK's 10min default.
      timeout: 10000,
      maxRetries: 0,
    })

    const text = (typeof transcription === 'string' ? transcription : '').trim()
    if (!text) return { text: '', translation: undefined as string | undefined }

    let translation: string | undefined
    if (translate) {
      const chat = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: '다음 텍스트를 자연스러운 한국어로 번역하세요. 번역문만 출력하고 다른 설명은 하지 마세요.',
          },
          { role: 'user', content: text },
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.2,
        max_tokens: 512,
      })
      translation = chat.choices[0]?.message?.content?.trim() ?? undefined
    }

    return { text, translation }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastErr: any = null
  // Try each key once, starting from the one we last knew to be good. Only a
  // daily-limit failure advances to the next key; any other error (incl. the
  // per-minute throttle) stops and is reported, since rotating keys won't help.
  for (let i = 0; i < keys.length; i++) {
    const idx = (currentKeyIndex + i) % keys.length
    try {
      const result = await attempt(keys[idx])
      currentKeyIndex = idx   // stick with whatever key just worked
      return Response.json(result)
    } catch (err) {
      lastErr = err
      if (isDailyLimit(err)) {
        // This key is out for the day — remember to skip it and try the next.
        currentKeyIndex = (idx + 1) % keys.length
        continue
      }
      break   // per-minute throttle or hard error — failover won't help
    }
  }

  // Groq SDK wraps HTTP errors — expose 429 + retry-after to the client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groqErr = lastErr as any
  if (groqErr?.status === 429) {
    const retryAfter = String(groqErr?.headers?.['retry-after'] ?? '5')
    // `daily` is true only if EVERY key is daily-exhausted (we got here after
    // exhausting the rotation). A per-minute throttle leaves daily false so the
    // client retries in seconds rather than showing the daily-quota notice.
    const daily = isDailyLimit(groqErr)
    return new Response(
      JSON.stringify({ error: 'Rate limit — retry after ' + retryAfter + 's', daily, detail: errDetail(groqErr) }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'retry-after': retryAfter } }
    )
  }
  const message = lastErr instanceof Error ? lastErr.message : 'Transcription failed'
  return Response.json({ error: message }, { status: 500 })
}
