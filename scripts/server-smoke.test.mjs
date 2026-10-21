// server.mjs smoke test (quality audit H3, 2026-10-21): the production
// static+proxy server was the highest-risk untested artifact in either
// repo — unlinted (now linted) and with zero tests. Spawns the real
// server against a temp dist and asserts the core static behaviors the
// deployment depends on. Run: node --test scripts/server-smoke.test.mjs
import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { spawn } from 'node:child_process'
import { createServer as netServer } from 'node:net'

/** Grab a free TCP port (bind :0, read, close). */
async function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = netServer()
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolvePort(port))
    })
    probe.on('error', reject)
  })
}

/** Start the server on a free port with the given dist dir. */
async function startServer(distDir) {
  const port = await freePort()
  const child = spawn('node', ['server.mjs', String(port), distDir, 'http://127.0.0.1:19090'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = []
  child.stdout.on('data', (c) => output.push(c.toString()))
  child.stderr.on('data', (c) => output.push(c.toString()))
  // Wait until the server answers on the port (listen + ready).
  const deadline = Date.now() + 10_000
  for (;;) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/asset.txt`)
      if (resp.status === 200) return { child, port }
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      child.kill()
      throw new Error(`server did not become ready; output: ${output.join('')}`)
    }
    await new Promise((r) => setTimeout(r, 50))
  }
}

test('serves the SPA index and static assets, 404s unknown API paths', async (t) => {
  const dist = await mkdtemp(join(tmpdir(), 'corec-server-smoke-'))
  await mkdir(dist, { recursive: true })
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>ok</title>')
  await writeFile(join(dist, 'asset.txt'), 'hello-static')
  const { child, port } = await startServer(dist)
  t.after(() => child.kill())

  const base = `http://127.0.0.1:${port}`

  // Static asset.
  const asset = await fetch(`${base}/asset.txt`)
  assert.equal(asset.status, 200)
  assert.equal(await asset.text(), 'hello-static')

  // SPA history-fallback: an unknown client route serves index.html.
  const spa = await fetch(`${base}/some/client/route`)
  assert.equal(spa.status, 200)
  assert.ok((await spa.text()).includes('<!doctype html>'))

  // Proxy prefix reaches the (nonexistent) upstream → 502, NOT a static
  // fallback: proves the proxy branch is taken for /corec-api/*.
  const proxied = await fetch(`${base}/corec-api/healthz/live`)
  assert.ok([502, 504, 500].includes(proxied.status), `expected proxy error, got ${proxied.status}`)

  // Path traversal is rejected (safeStaticPath): encoded ../ stays a 404
  // and never resolves outside dist.
  const traversal = await fetch(`${base}/%2e%2e%2f%2e%2e%2fetc%2fpasswd`)
  // 403 = safeStaticPath explicitly rejects the encoded traversal (better
  // than a bare 404); 404/400 are acceptable rejections too.
  assert.ok([403, 404, 400].includes(traversal.status), `traversal status ${traversal.status}`)
  const body = await traversal.text()
  assert.ok(!body.includes('root:'), 'traversal must not serve system files')
})
