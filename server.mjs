// CoreC-Dashboard production server: static files + same-origin reverse proxy.
//
// - Serves static files from DIST with SPA history-fallback.
// - Reverse-proxies /corec-api/* → http://127.0.0.1:9090/* (strips the prefix),
//   so the browser only needs to reach this one port. Eliminates CSP, CORS,
//   and port-blocking issues — the browser talks same-origin, the server
//   forwards to CoreC over localhost.
// - Forwards WebSocket upgrade requests (/corec-api/logs, /alerts/stream,
//   /tags/stream, …) so real-time streams work through the same proxy.
//
// Usage: node server.mjs [port] [distDir] [corecTarget]

import { createServer } from 'node:http'
import { request as httpRequest } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, join, sep } from 'node:path'

const PORT = parseInt(process.argv[2] || '8080', 10)
const DIST = resolve(process.argv[3] || './dist')
const COREC = process.argv[4] || 'http://127.0.0.1:9090'
const PROXY_PREFIX = '/corec-api'

// Parse COREC target into host/port
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
  const clean = resolve(DIST, '.' + (decoded === '/' ? '' : decoded)).replace(/\0/g, '')
  if (clean !== DIST && !clean.startsWith(DIST + sep)) return null
  return clean
}

/** Strip /corec-api prefix from the URL, keeping the query string. */
function stripProxyPrefix(url) {
  if (url.startsWith(PROXY_PREFIX + '/')) return url.slice(PROXY_PREFIX.length) // keeps leading /
  return '/' // bare /corec-api or /corec-api with no slash
}

/** Build forwarded headers — keep everything except host (rewrite to CoreC). */
function forwardedHeaders(req) {
  const fwdHeaders = { ...req.headers }
  fwdHeaders.host = corecUrl.host // CoreC expects its own host
  return fwdHeaders
}

/** Reverse-proxy a normal HTTP request to CoreC, stripping the /corec-api prefix. */
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
      // Forward status + headers back to the browser.
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

  // Stream request body to CoreC (handles large PUT /configs payloads).
  req.pipe(proxyReq)
}

/**
 * Forward WebSocket upgrade requests to CoreC.
 *
 * Without this handler, Node's HTTP server receives the browser's
 * ws://host/corec-api/logs upgrade request but has no 'upgrade' listener,
 * so the socket is silently destroyed. The Dashboard's CoreCWebSocket class
 * then retries 10× and gives up — but the DiagnosticsPage banner
 * "[CoreC Stream] 已连接到事件日志总线..." was printed statically before the
 * connection attempt, so the user sees a frozen "connected" message with no
 * log lines ever arriving.
 *
 * This handler relays the 101 Switching Protocols handshake and pipes the
 * raw TCP socket bidirectionally so WebSocket frames pass through unchanged.
 */
function proxyUpgradeToCoreC(req, socket, head) {
  // Only proxy /corec-api/* upgrades; destroy everything else.
  if (req.url !== PROXY_PREFIX && !req.url.startsWith(PROXY_PREFIX + '/')) {
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

  // CoreC responds with 101 → relay the handshake to the browser and pipe.
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    // Reconstruct the 101 response line + headers for the browser.
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

    // Clean up on either side closing or erroring.
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
  // Content-Encoding is intentionally preserved: http.request does NOT
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

/** Serve static file or SPA fallback. */
async function serveStatic(req, res) {
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
        res.writeHead(200, { 'Content-Type': MIME['.html'] })
        res.end(data)
        return
      } catch {
        // fall through to SPA fallback
      }
    } else {
      const data = await readFile(p)
      res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' })
      res.end(data)
      return
    }
  } catch {
    // not found → SPA fallback
  }
  try {
    const data = await readFile(join(DIST, 'index.html'))
    res.writeHead(200, { 'Content-Type': MIME['.html'] })
    res.end(data)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }
}

const server = createServer((req, res) => {
  // Route: /corec-api/* → CoreC reverse proxy; everything else → static.
  if (req.url === PROXY_PREFIX || req.url.startsWith(PROXY_PREFIX + '/')) {
    return proxyToCoreC(req, res)
  }
  return serveStatic(req, res)
})

// Forward WebSocket upgrades to CoreC (real-time log/alert/tag streams).
server.on('upgrade', proxyUpgradeToCoreC)

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `CoreC-Dashboard listening on http://0.0.0.0:${PORT} ` +
      `(static: ${DIST}, proxy: ${PROXY_PREFIX}/* → ${COREC}, ws: upgrade)`,
  )
})
