import { NextRequest } from 'next/server'
import https from 'https'
import http from 'http'
import { IncomingMessage } from 'http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Korean CDN + international HLS hosts
const ALLOWED_HOSTS = [
  'kbs.co.kr',
  'gscdn.kbs.co.kr',
  'imbc.com',
  'minisw.imbc.com',
  'sbs.co.kr',
  'radiolive.sbs.co.kr',
  'ebsonair.ebs.co.kr',
  'ebs.co.kr',
  'bbcmedia.co.uk',
  'somafm.com',
  'radiofrance.fr',
  'srg-ssr.ch',
  'musicradio.com',
  'streamguys1.com',
  'wnyc.org',
  'wfmu.org',
]

function isAllowed(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h))
  } catch {
    return false
  }
}

function fetchRaw(url: string): Promise<{ body: Buffer; contentType: string; status: number }> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http
    const req = mod.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RadioTranscriber/1.0)',
          Accept: '*/*',
        },
      },
      (res: IncomingMessage) => {
        // Follow redirects
        if (
          res.statusCode &&
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          res.resume()
          const location = new URL(res.headers.location, url).href
          fetchRaw(location).then(resolve).catch(reject)
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          resolve({
            body: Buffer.concat(chunks),
            contentType: res.headers['content-type'] ?? '',
            status: res.statusCode ?? 200,
          })
        )
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    req.setTimeout(15000, () => {
      req.destroy()
      reject(new Error('HLS fetch timeout'))
    })
  })
}

function rewriteM3u8(text: string, baseUrl: string): string {
  const base = new URL(baseUrl)
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim()
      if (!trimmed) return line

      // Rewrite URI="..." in #EXT-X-MAP, #EXT-X-MEDIA, #EXT-X-KEY tags etc.
      if (trimmed.startsWith('#')) {
        return trimmed.replace(/URI="([^"]+)"/g, (_, uri) => {
          const abs = uri.startsWith('http') ? uri : new URL(uri, base).href
          return `URI="/api/hls?url=${encodeURIComponent(abs)}"`
        })
      }

      // Segment or sub-playlist URL line
      const abs = trimmed.startsWith('http') ? trimmed : new URL(trimmed, base).href
      return `/api/hls?url=${encodeURIComponent(abs)}`
    })
    .join('\n')
}

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get('url')
  if (!urlParam) return new Response('Missing url', { status: 400 })

  let url: string
  try {
    url = decodeURIComponent(urlParam)
  } catch {
    return new Response('Invalid url', { status: 400 })
  }

  if (!isAllowed(url)) {
    return new Response('Host not allowed', { status: 403 })
  }

  try {
    const { body, contentType, status } = await fetchRaw(url)
    const isPlaylist =
      contentType.includes('mpegurl') ||
      contentType.includes('m3u') ||
      url.includes('.m3u8') ||
      url.includes('playlist')

    if (isPlaylist) {
      const text = body.toString('utf-8')
      const rewritten = rewriteM3u8(text, url)
      return new Response(rewritten, {
        status,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store',
        },
      })
    } else {
      return new Response(body.buffer as ArrayBuffer, {
        status,
        headers: {
          'Content-Type': contentType || 'video/mp2t',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'HLS proxy error'
    return new Response(msg, { status: 502 })
  }
}
