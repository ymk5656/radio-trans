import { NextRequest } from 'next/server'
import https from 'https'
import http from 'http'
import { IncomingMessage } from 'http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Using endsWith check: 'streamguys1.com' matches any subdomain
const ALLOWED_HOSTS = [
  'streamguys1.com',          // NPR, KCRW, KPCC, WBEZ, RFI, Classic FM affiliates
  'wfmu.org',                 // WFMU
  'musicradio.com',           // Classic FM, Jazz FM (UK)
  'radio.garden',             // radio.garden streams
  'bbcmedia.co.uk',           // BBC Radio (World Service, Radio 4, 6 Music, etc.)
  'somafm.com',               // SomaFM (Groove Salad, Drone Zone, Lush)
  'radiofrance.fr',           // France Inter, RFI
  'wnyc.org',                 // WNYC New York
  'kqed.org',                 // KQED San Francisco
  'srg-ssr.ch',               // Swiss Radio (Radio Swiss Jazz)
  'ebsonair.ebs.co.kr',       // EBS FM (static m3u8)
]

/**
 * Use Node.js native http/https to pipe audio streams without buffering.
 * fetch() in Next.js App Router can buffer the response body before streaming,
 * which causes infinite audio streams to hang indefinitely.
 */
function proxyRequest(url: string, redirects = 0): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Too many redirects'))
      return
    }
    const mod = url.startsWith('https:') ? https : http
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RadioTranscriber/1.0)',
        'Icy-MetaData': '0',
        Accept: 'audio/*,*/*',
      },
    }, (res) => {
      const { statusCode, headers } = res
      if (statusCode && [301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
        res.resume() // drain and discard redirect body
        const location = new URL(headers.location, url).href
        proxyRequest(location, redirects + 1).then(resolve).catch(reject)
      } else {
        resolve(res)
      }
    })
    req.on('error', reject)
    // 8s timeout — fail fast so browser shows error instead of hanging forever
    req.setTimeout(8000, () => {
      req.destroy()
      reject(new Error('Connection timeout'))
    })
  })
}

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get('url')
  if (!urlParam) {
    return Response.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  let url: string
  try {
    url = decodeURIComponent(urlParam)
    const parsed = new URL(url)
    if (!ALLOWED_HOSTS.some(h => parsed.hostname.endsWith(h))) {
      return Response.json({ error: 'Host not allowed' }, { status: 403 })
    }
  } catch {
    return Response.json({ error: 'Invalid URL' }, { status: 400 })
  }

  let upstream: IncomingMessage
  try {
    upstream = await proxyRequest(url)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }

  if (upstream.statusCode && upstream.statusCode >= 400) {
    upstream.resume() // drain response
    return Response.json(
      { error: `Upstream error: ${upstream.statusCode}` },
      { status: upstream.statusCode }
    )
  }

  const contentType = upstream.headers['content-type'] ?? 'audio/mpeg'

  // Pipe the Node.js readable stream through a Web ReadableStream
  const stream = new ReadableStream({
    start(controller) {
      upstream.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk))
      })
      upstream.on('end', () => controller.close())
      upstream.on('error', (err: Error) => controller.error(err))
    },
    cancel() {
      // Client disconnected — destroy upstream connection
      upstream.destroy()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
      'X-Accel-Buffering': 'no', // disable nginx buffering if behind a proxy
    },
  })
}
