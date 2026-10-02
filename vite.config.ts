import { request as httpRequest } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Vite dev-server plugin: dynamic per-instance same-origin proxy (TD-SEC-001/002, D3).
 * In dev the browser sends /corec-proxy/* with X-CoreC-Target header (HTTP) or
 * /corec-ws?target=... (WS). This middleware proxies to the target backend so
 * the dev workflow matches production (server.mjs).
 */
function dynamicProxyPlugin(): Plugin {
  return {
    name: 'corec-dynamic-proxy',
    configureServer(server) {
      server.middlewares.use('/corec-proxy', (req, res) => {
        const targetRaw = req.headers['x-corec-target'] as string | undefined
        if (!targetRaw) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing X-CoreC-Target header' }))
          return
        }
        let target: URL
        try {
          target = new URL(targetRaw)
          if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error()
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid target URL' }))
          return
        }
        const reqUrl = req.url || '/'
        const fwdHeaders = { ...req.headers }
        delete fwdHeaders['x-corec-target']
        fwdHeaders.host = target.host
        const proxyReq = httpRequest(
          {
            hostname: target.hostname,
            port: target.port || (target.protocol === 'https:' ? 443 : 80),
            path: reqUrl,
            method: req.method || 'GET',
            headers: fwdHeaders,
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
            proxyRes.pipe(res, { end: true })
          },
        )
        proxyReq.on('error', (err) => {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Backend unreachable', detail: err.message }))
          }
        })
        req.pipe(proxyReq)
      })

      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (!req.url?.startsWith('/corec-ws')) return
        const urlObj = new URL(req.url, 'http://placeholder')
        const rawTarget = urlObj.searchParams.get('target')
        if (!rawTarget) {
          socket.destroy()
          return
        }
        const httpTarget = rawTarget.replace(/^ws:/i, 'http:').replace(/^wss:/i, 'https:')
        let target: URL
        try {
          target = new URL(httpTarget)
          if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error()
        } catch {
          socket.destroy()
          return
        }
        const targetUrl = new URL(rawTarget)
        const targetPath = targetUrl.pathname + (targetUrl.search || '')
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
          if (proxyHead?.length) socket.write(proxyHead)
          if (head?.length) proxySocket.write(head)
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
        proxyReq.on('error', () => {
          if (!socket.destroyed) socket.destroy()
        })
        proxyReq.end()
      })
    },
  }
}

/**
 * Vite plugin: self-host Monaco editor assets (TD-PERF-010, D7).
 * Serves node_modules/monaco-editor/min/vs at /monaco/min/vs in dev mode.
 * In production, copies the assets to dist/monaco/min/vs during build.
 */
const MONACO_VS_DIR = path.resolve(import.meta.dirname, 'node_modules/monaco-editor/min/vs')
const MONACO_SERVE_PREFIX = '/monaco/min/vs'
const MIME_MAP: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
}

function monacoSelfHostPlugin(): Plugin {
  return {
    name: 'monaco-self-host',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const reqUrl = req.url || ''
        if (!reqUrl.startsWith(MONACO_SERVE_PREFIX)) return next()
        const relPath = reqUrl.slice(MONACO_SERVE_PREFIX.length).split('?')[0]
        const filePath = path.join(MONACO_VS_DIR, relPath)
        stat(filePath)
          .then((s) => {
            if (!s.isFile()) throw new Error('not a file')
            return readFile(filePath)
          })
          .then((data) => {
            res.writeHead(200, {
              'Content-Type': MIME_MAP[path.extname(filePath)] || 'application/octet-stream',
            })
            res.end(data)
          })
          .catch(() => {
            res.writeHead(404)
            res.end('Not Found')
          })
      })
    },
    async writeBundle() {
      // Copy monaco/min/vs to dist/monaco/min/vs for production.
      const distDir = path.resolve(import.meta.dirname, 'dist/monaco/min/vs')
      if (!existsSync(MONACO_VS_DIR)) return
      const { cp } = await import('node:fs/promises')
      await cp(MONACO_VS_DIR, distDir, { recursive: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works under any host path — including
  // GitHub Pages custom domains, project subpaths, and local static servers.
  base: './',
  plugins: [react(), tailwindcss(), dynamicProxyPlugin(), monacoSelfHostPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: false,
    proxy: {
      '/corec-api': {
        target: 'http://127.0.0.1:9090',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/corec-api/, ''),
        ws: true,
      },
    },
  },
  build: {
    // Reset to default (500KB) now that vendor libs are manually split.
    // The warning surfaces regressions instead of being silenced.
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Split heavy vendor libs into cached chunks so the dashboard shell
        // (recharts is the biggest offender — 9.6MB installed, pulls d3 deps)
        // doesn't bloat the first-paint bundle on the default /monitor route.
        // Note: rolldown (Vite 8) requires manualChunks as a function.
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-recharts'
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('react-router'))
              return 'vendor-react'
            if (id.includes('@tanstack/react-query')) return 'vendor-query'
            if (id.includes('@radix-ui/')) return 'vendor-radix'
            if (id.includes('lightweight-charts')) return 'vendor-charts'
            if (id.includes('@xterm/')) return 'vendor-xterm'
            if (id.includes('js-yaml')) return 'vendor-jsyaml'
            if (id.includes('zod')) return 'vendor-zod'
            if (id.includes('/i18next/') || id.includes('react-i18next')) return 'vendor-i18n'
            if (id.includes('react-hook-form') || id.includes('@hookform/resolvers'))
              return 'vendor-rhf'
            if (id.includes('@monaco-editor/')) return 'vendor-monaco'
          }
          return undefined
        },
      },
    },
  },
})
