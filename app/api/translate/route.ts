import { NextRequest } from 'next/server'
import Groq from 'groq-sdk'

export const runtime = 'nodejs'

// Standalone translation endpoint. Decoupled from /api/transcribe so the
// original transcript can be shown immediately while the Korean translation is
// fetched in the background. Uses the chat model (separate rate budget from
// Whisper), with the same daily-quota key rotation as the transcribe route.
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

const _clients = new Map<string, Groq>()
function getGroq(apiKey: string): Groq {
  let c = _clients.get(apiKey)
  if (!c) { c = new Groq({ apiKey }); _clients.set(apiKey, c) }
  return c
}

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

  let body: { text?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const text = (body?.text ?? '').trim()
  if (!text) return Response.json({ translation: '' })

  async function attempt(apiKey: string): Promise<string> {
    const groq = getGroq(apiKey)
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
    }, {
      // Fail fast on a stalled socket rather than hanging on the SDK default.
      timeout: 10000,
      maxRetries: 0,
    })
    return chat.choices[0]?.message?.content?.trim() ?? ''
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastErr: any = null
  for (let i = 0; i < keys.length; i++) {
    const idx = (currentKeyIndex + i) % keys.length
    try {
      const translation = await attempt(keys[idx])
      currentKeyIndex = idx
      return Response.json({ translation })
    } catch (err) {
      lastErr = err
      if (isDailyLimit(err)) {
        currentKeyIndex = (idx + 1) % keys.length
        continue
      }
      break
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groqErr = lastErr as any
  if (groqErr?.status === 429) {
    const retryAfter = String(groqErr?.headers?.['retry-after'] ?? '5')
    return new Response(
      JSON.stringify({ error: 'rate_limit', detail: errDetail(groqErr) }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'retry-after': retryAfter } }
    )
  }
  const message = lastErr instanceof Error ? lastErr.message : 'Translation failed'
  return Response.json({ error: message }, { status: 500 })
}
