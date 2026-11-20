// CoreC-Dashboard production server: static files + same-origin reverse proxy.
//
// - Serves static files from DIST with SPA history-fallback.
// - Reverse-proxies /corec-api/* → CoreC target (argv[4], default
//   http://127.0.0.1:9090), stripping the prefix; the same-origin proxy
//   avoids cross-origin fetches from the browser to the backend.
// - /corec-proxy/* (X-CoreC-Target header) and /corec-ws (target query
//   param) proxy dynamically to client-specified backend targets.
// - Forwards WebSocket upgrade requests (/corec-api/logs, /alerts/stream,
//   /tags/stream, …) through the same proxy.
//
// Usage: node server.mjs [port] [distDir] [corecTarget]

import { readFile, stat } from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { gzipSync } from 'node:zlib'

const PORT = parseInt(process.argv[2] || '8080', 10)
const DIST = resolve(process.argv[3] || './dist')
const COREC = process.argv[4] || 'http://127.0.0.1:9090'
const PROXY_PREFIX = '/corec-api'
const DYNAMIC_PROXY_PREFIX = '/corec-proxy'
const DYNAMIC_WS_PREFIX = '/corec-ws'

let corecUrl
try {
  corecUrl = new URL(COREC)
} catch {
  console.error(`Invalid COREC target: ${COREC}`)
  process.exit(1)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}

// Guard against path traversal: ensure resolved path stays inside DIST.
// Uses a path-separator boundary check (not a bare string prefix match) so
// sibling directories whose name merely *starts* with DIST's basename (e.g.
// /usr/app/dist-secrets) cannot slip through. clean === DIST covers the root.
// Malformed %-sequences (e.g. /%E0%A4%A) make decodeURIComponent throw —
// catching that prevents a single crafted request from crashing the server.
function safeStaticPath(urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0])
  } catch {
    return null
  }
  const clean = resolve(DIST, `.${decoded === '/' ? '' : decoded}`).replace(/\0/g, '')
  if (clean !== DIST && !clean.startsWith(DIST + sep)) return null
  return clean
}

function stripProxyPrefix(url) {
  if (url.startsWith(`${PROXY_PREFIX}/`)) return url.slice(PROXY_PREFIX.length) // keeps leading /
  return '/' // bare /corec-api or /corec-api with no slash
}

function forwardedHeaders(req) {
  const fwdHeaders = { ...req.headers }
  fwdHeaders.host = corecUrl.host
  return fwdHeaders
}

function proxyToCoreC(req, res) {
  const targetPath = stripProxyPrefix(req.url)
  const fwdHeaders = forwardedHeaders(req)

  const proxyReq = httpRequest(
    {
      hostname: corecUrl.hostname,
      port: corecUrl.port || (corecUrl.protocol === 'https:' ? 443 : 80),
      path: targetPath,
      method: req.method,
      headers: fwdHeaders,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers)
      proxyRes.pipe(res, { end: true })
    },
  )

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: 'CoreC backend unreachable',
          detail: err.message,
        }),
      )
    } else {
      res.destroy()
    }
  })

  req.pipe(proxyReq)
}

/**
 * Forward WebSocket upgrade requests to CoreC: relays the 101 Switching
 * Protocols handshake and pipes the raw TCP socket bidirectionally so
 * WebSocket frames pass through unchanged.
 */
function proxyUpgradeToCoreC(req, socket, head) {
  if (req.url !== PROXY_PREFIX && !req.url.startsWith(`${PROXY_PREFIX}/`)) {
    socket.destroy()
    return
  }

  const targetPath = stripProxyPrefix(req.url)
  const fwdHeaders = forwardedHeaders(req)

  const proxyReq = httpRequest({
    hostname: corecUrl.hostname,
    port: corecUrl.port || (corecUrl.protocol === 'https:' ? 443 : 80),
    path: targetPath,
    method: 'GET',
    headers: fwdHeaders,
  })

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    const headLines = [
      'HTTP/1.1 101 Switching Protocols',
      ...Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`),
      '',
      '',
    ]
    socket.write(headLines.join('\r\n'))

    // Forward any data CoreC sent immediately after the handshake.
    if (proxyHead && proxyHead.length > 0) {
      socket.write(proxyHead)
    }

    // Forward any data the browser sent immediately after its upgrade request.
    if (head && head.length > 0) {
      proxySocket.write(head)
    }

    // Bidirectional pipe: browser ↔ CoreC (raw WebSocket frames).
    proxySocket.pipe(socket)
    socket.pipe(proxySocket)

    const cleanup = () => {
      proxySocket.destroy()
      socket.destroy()
    }
    proxySocket.on('error', cleanup)
    socket.on('error', cleanup)
    proxySocket.on('close', cleanup)
    socket.on('close', cleanup)
  })

  // If CoreC rejects the upgrade (e.g. bad token → 4xx), relay the response
  // so the browser sees the real status instead of a silent socket close.
  // Node auto-dechunks Transfer-Encoding: chunked on IncomingMessage but
  // leaves the header in place — forwarding it verbatim would make the
  // browser expect chunk framing that the piped (de-chunked) body lacks.
  // Buffer the small rejection body and re-emit with a correct length.
  // Content-Encoding is preserved: http.request does NOT
  // auto-decompress, so the body is still encoded and the header is truthful.
  proxyReq.on('response', (proxyRes) => {
    const chunks = []
    proxyRes.on('data', (c) => chunks.push(c))
    proxyRes.on('end', () => {
      const body = Buffer.concat(chunks)
      const headers = { ...proxyRes.headers }
      delete headers['transfer-encoding']
      headers['content-length'] = String(body.length)
      const headLines = [
        `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}`,
        ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
        '',
        '',
      ]
      socket.write(headLines.join('\r\n'))
      socket.write(body)
      socket.end()
    })
    proxyRes.on('error', () => {
      if (!socket.destroyed) socket.destroy()
    })
  })

  proxyReq.on('error', () => {
    if (!socket.destroyed) socket.destroy()
  })

  proxyReq.end()
}

// Dynamic per-instance proxy: the browser sends same-origin requests to
// /corec-proxy/* with an X-CoreC-Target header containing the instance's
// baseUrl. The server validates the target and proxies the request, making
// API requests same-origin (avoiding cross-origin fetches to the backend).

function parseTarget(raw) {
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname) return null
    return u
  } catch {
    return null
  }
}

function stripDynamicProxyPrefix(url) {
  if (url.startsWith(`${DYNAMIC_PROXY_PREFIX}/`)) return url.slice(DYNAMIC_PROXY_PREFIX.length)
  return '/'
}

function proxyDynamic(req, res) {
  const target = parseTarget(req.headers['x-corec-target'])
  if (!target) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing or invalid X-CoreC-Target header' }))
    return
  }

  const targetPath = stripDynamicProxyPrefix(req.url)
  const fwdHeaders = { ...req.headers }
  delete fwdHeaders['x-corec-target']
  fwdHeaders.host = target.host

  const proxyReq = httpRequest(
    {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: targetPath,
      method: req.method,
      headers: fwdHeaders,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers)
      proxyRes.pipe(res, { end: true })
    },
  )

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Backend unreachable', detail: err.message }))
    } else {
      res.destroy()
    }
  })

  req.pipe(proxyReq)
}

/**
 * Dynamic WebSocket proxy: the browser connects same-origin to
 * ws://host/corec-ws?target=<backend>; the bearer travels via the
 * Sec-WebSocket-Protocol header, which is forwarded to the backend.
 */
function proxyDynamicUpgrade(req, socket, head) {
  const urlObj = new URL(req.url, 'http://placeholder')
  const rawTarget = urlObj.searchParams.get('target')
  if (!rawTarget) {
    socket.destroy()
    return
  }

  // Convert ws:/wss: to http:/https: for URL parsing, then use ws/wss port.
  const httpTarget = rawTarget.replace(/^ws:/i, 'http:').replace(/^wss:/i, 'https:')
  const target = parseTarget(httpTarget)
  if (!target) {
    socket.destroy()
    return
  }

  // Stream params (interval, tag, etc.) sit on the proxy URL — NOT inside
  // the `target` param — and must reach the backend. Final path = target's
  // own search params plus all proxy-level params except `target`.
  const targetUrl = new URL(rawTarget)
  const finalUrl = new URL(targetUrl.pathname, 'http://placeholder')
  for (const [k, v] of targetUrl.searchParams) {
    finalUrl.searchParams.set(k, v)
  }
  // Forward proxy-level stream params (interval, tag, etc.) — skip `target`.
  for (const [k, v] of urlObj.searchParams) {
    if (k !== 'target') {
      finalUrl.searchParams.set(k, v)
    }
  }
  const targetPath = finalUrl.pathname + (finalUrl.search || '')

  const fwdHeaders = { ...req.headers }
  fwdHeaders.host = target.host

  const proxyReq = httpRequest({
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: targetPath,
    method: 'GET',
    headers: fwdHeaders,
  })

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    const headLines = [
      'HTTP/1.1 101 Switching Protocols',
      ...Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`),
      '',
      '',
    ]
    socket.write(headLines.join('\r\n'))
    if (proxyHead && proxyHead.length > 0) socket.write(proxyHead)
    if (head && head.length > 0) proxySocket.write(head)
    proxySocket.pipe(socket)
    socket.pipe(proxySocket)
    const cleanup = () => {
      proxySocket.destroy()
      socket.destroy()
    }
    proxySocket.on('error', cleanup)
    socket.on('error', cleanup)
    proxySocket.on('close', cleanup)
    socket.on('close', cleanup)
  })

  proxyReq.on('response', (proxyRes) => {
    const chunks = []
    proxyRes.on('data', (c) => chunks.push(c))
    proxyRes.on('end', () => {
      const body = Buffer.concat(chunks)
      const headers = { ...proxyRes.headers }
      delete headers['transfer-encoding']
      headers['content-length'] = String(body.length)
      const headLines = [
        `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}`,
        ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
        '',
        '',
      ]
      socket.write(headLines.join('\r\n'))
      socket.write(body)
      socket.end()
    })
    proxyRes.on('error', () => {
      if (!socket.destroyed) socket.destroy()
    })
  })

  proxyReq.on('error', () => {
    if (!socket.destroyed) socket.destroy()
  })

  proxyReq.end()
}

const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable'
const CACHE_HTML = 'no-cache'
const CACHE_SHORT = 'public, max-age=3600'
const COMPRESSIBLE = /\.(?:js|css|html|json|svg|txt|map)$/i

/**
 * Write a static response with gzip (when accepted) and a cache policy that
 * matches the asset type: hashed /assets/* are immutable for a year, the
 * SPA shell must revalidate, everything else gets a short cache.
 */
function sendStatic(req, res, data, ext, cacheControl) {
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl,
    Vary: 'Accept-Encoding',
  }
  const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '')
  if (COMPRESSIBLE.test(ext) && data.length > 1024 && acceptsGzip) {
    const gz = gzipSync(data, { level: 6 })
    headers['Content-Encoding'] = 'gzip'
    headers['Content-Length'] = gz.length
    res.writeHead(200, headers)
    res.end(gz)
    return
  }
  headers['Content-Length'] = data.length
  res.writeHead(200, headers)
  res.end(data)
}

async function serveStatic(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // 未设 HSTS（部署经 HTTP 自定义域，见 deploy.yml）。
  const p = safeStaticPath(req.url)
  if (!p) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  try {
    const s = await stat(p)
    if (s.isDirectory()) {
      try {
        const data = await readFile(join(p, 'index.html'))
        sendStatic(req, res, data, '.html', CACHE_HTML)
        return
      } catch {
        // fall through to SPA fallback
      }
    } else {
      const data = await readFile(p)
      const ext = extname(p)
      sendStatic(
        req,
        res,
        data,
        ext,
        req.url.startsWith('/assets/') ? CACHE_IMMUTABLE : CACHE_SHORT,
      )
      return
    }
  } catch {
    // not found → SPA fallback
  }
  try {
    const data = await readFile(join(DIST, 'index.html'))
    sendStatic(req, res, data, '.html', CACHE_HTML)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }
}

const server = createServer((req, res) => {
  // Route: /corec-api/* → fixed CoreC reverse proxy (single-backend deploy).
  if (req.url === PROXY_PREFIX || req.url.startsWith(`${PROXY_PREFIX}/`)) {
    return proxyToCoreC(req, res)
  }
  // Route: /corec-proxy/* → dynamic per-instance proxy (multi-instance deploy).
  if (req.url === DYNAMIC_PROXY_PREFIX || req.url.startsWith(`${DYNAMIC_PROXY_PREFIX}/`)) {
    return proxyDynamic(req, res)
  }
  return serveStatic(req, res)
})

// Forward WebSocket upgrades: fixed proxy for /corec-api/*, dynamic for /corec-ws.
server.on('upgrade', (req, socket, head) => {
  if (req.url === PROXY_PREFIX || req.url.startsWith(`${PROXY_PREFIX}/`)) {
    return proxyUpgradeToCoreC(req, socket, head)
  }
  if (req.url === DYNAMIC_WS_PREFIX || req.url.startsWith(`${DYNAMIC_WS_PREFIX}?`)) {
    return proxyDynamicUpgrade(req, socket, head)
  }
  socket.destroy()
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `CoreC-Dashboard listening on http://0.0.0.0:${PORT} ` +
      `(static: ${DIST}, proxy: ${PROXY_PREFIX}/* → ${COREC}, ws: upgrade)`,
  )
})
