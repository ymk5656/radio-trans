import { NextRequest } from 'next/server'
import Groq from 'groq-sdk'

export const runtime = 'nodejs'

// Module-level singleton — avoids re-instantiating the SDK on every request
let _groq: Groq | null = null
function getGroq(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })
  return _groq
}

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
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

  try {
    const groq = getGroq()

    // whisper-large-v3-turbo: best speed/accuracy trade-off on Groq
    // language hint skips auto-detection (~50-100 ms saved per request)
    const transcription = await groq.audio.transcriptions.create({
      file: audio,
      model: 'whisper-large-v3-turbo',
      response_format: 'text',
      ...(language ? { language } : {}),
    })

    const text = (typeof transcription === 'string' ? transcription : '').trim()
    if (!text) return Response.json({ text: '', translation: undefined })

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

    return Response.json({ text, translation })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
