import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Resolves a dynamic stream URL for Korean radio stations.
 * GET /api/resolve-stream?type=kbs&code=21
 * GET /api/resolve-stream?type=mbc&ch=sfm
 * GET /api/resolve-stream?type=sbs&ch=lovefm
 */
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type')
  const code = req.nextUrl.searchParams.get('code')
  const ch = req.nextUrl.searchParams.get('ch')

  try {
    if (type === 'kbs' && code) {
      return await resolveKBS(code)
    }
    if (type === 'mbc' && ch) {
      return await resolveMBC(ch)
    }
    if (type === 'sbs' && ch) {
      return await resolveSBS(ch)
    }
    return Response.json({ error: 'Unknown type or missing params' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Resolution failed'
    return Response.json({ error: msg }, { status: 500 })
  }
}

/** Recursively search JSON for any http URL containing .m3u8 */
function findM3u8Url(obj: unknown): string | undefined {
  if (typeof obj === 'string') {
    if (obj.startsWith('http') && obj.includes('.m3u8')) return obj
    return undefined
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findM3u8Url(item)
      if (found) return found
    }
  } else if (obj && typeof obj === 'object') {
    for (const val of Object.values(obj as Record<string, unknown>)) {
      const found = findM3u8Url(val)
      if (found) return found
    }
  }
  return undefined
}

const KBS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://www.kbs.co.kr/',
  'Origin': 'https://www.kbs.co.kr',
  'Accept': 'application/json, */*',
}

async function resolveKBS(code: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)

  // Primary API
  const primaryUrl = `https://cfpwwwapi.kbs.co.kr/api/v1/landing/live/channel_code/${code}`
  // Fallback API (KBS html5api)
  const fallbackUrl = `https://www.kbs.co.kr/html5api/channelInfo/?svc=kbs&ch_code=${code}&profile=pc&streaming_type=HLS`

  try {
    const res = await fetch(primaryUrl, { signal: controller.signal, headers: KBS_HEADERS })
    clearTimeout(timer)

    if (res.ok) {
      const data = await res.json()
      // Try known field shapes first
      let url: string | undefined =
        data?.channel_item?.[0]?.service_url ??
        data?.channel?.item?.[0]?.service_url ??
        data?.item?.[0]?.service_url
      // Fallback: recursive scan for any .m3u8 URL in the response
      if (!url) url = findM3u8Url(data)
      if (url) return Response.json({ url })
    }
  } catch {
    clearTimeout(timer)
  }

  // Try fallback API
  try {
    const controller2 = new AbortController()
    const timer2 = setTimeout(() => controller2.abort(), 10000)
    const res2 = await fetch(fallbackUrl, { signal: controller2.signal, headers: KBS_HEADERS })
    clearTimeout(timer2)
    if (res2.ok) {
      const text = (await res2.text()).trim()
      // Response may be plain URL or JSON
      if (text.startsWith('http') && text.includes('.m3u8')) {
        return Response.json({ url: text })
      }
      try {
        const data2 = JSON.parse(text)
        const url = findM3u8Url(data2)
        if (url) return Response.json({ url })
      } catch { /* not JSON */ }
    }
  } catch { /* ignore fallback failure */ }

  return Response.json({ error: 'KBS: stream URL not found — API may have changed' }, { status: 502 })
}

async function resolveMBC(ch: string) {
  // ch: 'sfm' (표준FM) | 'mfm' (FM4U)
  const apiUrl = `https://sminiplay.imbc.com/aacplay.ashx?agent=webapp&channel=${ch}`
  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) {
    return Response.json({ error: `MBC API error: ${res.status}` }, { status: 502 })
  }
  const url = (await res.text()).trim()
  if (!url || !url.startsWith('http')) {
    return Response.json({ error: 'MBC: invalid stream URL returned' }, { status: 502 })
  }
  return Response.json({ url })
}

async function resolveSBS(ch: string) {
  // ch: 'lovefm' | 'powerfm'
  const prefix = ch === 'lovefm' ? 'love' : 'power'
  const apiUrl = `https://apis.sbs.co.kr/play-api/1.0/livestream/${prefix}pc/${ch}?protocol=hls&ssl=Y`
  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) {
    return Response.json({ error: `SBS API error: ${res.status}` }, { status: 502 })
  }
  const url = (await res.text()).trim()
  if (!url || !url.startsWith('http')) {
    return Response.json({ error: 'SBS: invalid stream URL returned' }, { status: 502 })
  }
  return Response.json({ url })
}
