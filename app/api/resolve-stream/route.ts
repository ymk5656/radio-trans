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

async function resolveKBS(code: string) {
  const apiUrl = `https://cfpwwwapi.kbs.co.kr/api/v1/landing/live/channel_code/${code}`
  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) {
    return Response.json({ error: `KBS API error: ${res.status}` }, { status: 502 })
  }
  const data = await res.json()

  // Try multiple known field shapes
  const url: string | undefined =
    data?.channel_item?.[0]?.service_url ??
    data?.channel?.item?.[0]?.service_url ??
    data?.item?.[0]?.service_url

  if (!url) {
    return Response.json({ error: 'KBS: stream URL not found in response' }, { status: 502 })
  }
  return Response.json({ url })
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
