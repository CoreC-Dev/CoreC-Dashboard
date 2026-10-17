import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveConnection } from '@/api/activeConnection'
import { ApiError } from '@/api/client'
import {
  getConfigBackupContent,
  getConfigBackups,
  getConfigs,
  getConfigsRaw,
  getDeadLetters,
  getDriver,
  getDrivers,
  getDriverTags,
  getHealthzLive,
  getHealthzReady,
  getMetricsText,
  getRules,
  getServerInfo,
  getStats,
  getTags,
  getTransport,
  getTransports,
  getVersion,
  getWriteHistory,
  patchConfigs,
  postDriverTest,
  postRulesPreview,
  restoreConfigBackup,
  toggleRule,
  updateConfigs,
  validateConfigs,
  writeTag,
} from '@/api/endpoints/index'
import type { PreviewDataPoint } from '@/types/api'

// Mock fetch — each test configures the response it expects.
const mockFetch = vi.fn()
globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch

// A minimal valid YAML config used as the validate payload.
const VALID_YAML = [
  'node:',
  '  id: edge',
  '  role: collector',
  'global:',
  '  log-level: info',
  '  api:',
  '    listen: 0.0.0.0:9090',
  '    secret: valid-secret-123',
  'drivers:',
  '  - name: plc1',
  '    type: modbus-tcp',
  '    settings:',
  '      host: 192.168.1.5',
  '      port: 502',
  '    tags:',
  '      - name: temp',
  '        address: "40001"',
  '        type: float32',
  'transports:',
  '  - name: wh1',
  '    type: http',
  '    settings:',
  '      webhook-addr: 0.0.0.0:9091',
  '      webhook-path: /data',
  'rules:',
  '  - name: r1',
  '    match: ALL',
  '    action: forward',
  '',
].join('\n')

beforeEach(() => {
  mockFetch.mockReset()
  // Seed the active connection so apiRequest builds a valid URL.
  setActiveConnection({
    instanceId: 'test-instance',
    baseUrl: 'http://127.0.0.1:9090',
    secret: 'test-secret-token',
  })
})

describe('getConfigsRaw (GET /configs/raw)', () => {
  it('returns the YAML text body when content-type is application/yaml', async () => {
    const yamlText = 'global:\n  api:\n    secret: "***"\n'
    mockFetch.mockResolvedValueOnce(
      new Response(yamlText, {
        status: 200,
        headers: { 'content-type': 'application/yaml; charset=utf-8' },
      }),
    )

    const result = await getConfigsRaw()

    expect(result).toBe(yamlText)
    // Verify the request was shaped correctly.
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/corec-proxy/configs/raw')
    expect(init?.method).toBeUndefined() // GET is the default
    expect(init?.headers.get('X-CoreC-Target')).toBe('http://127.0.0.1:9090')
    expect(init?.headers.get('Authorization')).toBe('Bearer test-secret-token')
    expect(init?.headers.get('Accept')).toBe('application/yaml')
  })

  it('surfaces redacted sentinel without leaking the real secret', async () => {
    // Simulates the server's redaction: secret → "***", never the real value.
    const yamlText = 'global:\n  api:\n    secret: "***"\n'
    mockFetch.mockResolvedValueOnce(
      new Response(yamlText, {
        status: 200,
        headers: { 'content-type': 'application/yaml' },
      }),
    )

    const result = await getConfigsRaw()

    expect(result).toContain('"***"')
    expect(result).not.toContain('super-secret-api-token-2026')
  })
})

describe('validateConfigs (POST /configs/validate)', () => {
  it('returns { valid: true } on a 200 response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ valid: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await validateConfigs(VALID_YAML)

    expect(result).toEqual({ valid: true })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/corec-proxy/configs/validate')
    expect(init?.method).toBe('POST')
    expect(init?.headers.get('X-CoreC-Target')).toBe('http://127.0.0.1:9090')
    expect((init!.headers as Headers).get('Content-Type')).toBe('application/json')
    // Payload wrapped in { payload: <yaml> }.
    expect(JSON.parse(init?.body as string)).toEqual({ payload: VALID_YAML })
  })

  it('returns { valid: false, error } on a 400 WITHOUT throwing', async () => {
    // A validation failure is a normal outcome: the endpoint returns 400 with a
    // JSON {valid:false,error} body. The wrapper must normalize this into a
    // structured result so the UI can render the error rather than catching.
    // (Uses a hard validation error — short api.secret — since "no data source"
    // is now a non-blocking warning, not a 400.)
    const errBody = JSON.stringify({
      valid: false,
      error: 'config validation failed: api.secret must be at least 8 characters',
    })
    mockFetch.mockResolvedValueOnce(
      new Response(errBody, {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await validateConfigs('global:\n  api:\n    listen: ":9090"\n    secret: "x"\n')

    expect(result).toEqual({
      valid: false,
      error: 'config validation failed: api.secret must be at least 8 characters',
    })
  })

  it('re-throws non-400 transport errors (e.g. 500)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('internal server error', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    // Call once and capture the error to assert both type and status.
    let caught: unknown
    try {
      await validateConfigs(VALID_YAML)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).status).toBe(500)
  })

  it('re-throws when the 400 body is not a valid JSON {valid} shape', async () => {
    // Malformed 400 body (e.g. reverse proxy HTML error page) — the wrapper
    // cannot interpret it, so it must surface the error rather than swallow it.
    mockFetch.mockResolvedValueOnce(
      new Response('<html>Bad Gateway</html>', {
        status: 400,
        headers: { 'content-type': 'text/html' },
      }),
    )

    await expect(validateConfigs(VALID_YAML)).rejects.toThrow()
  })

  it('throws ApiError(401) on unauthorized', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('{"error":"unauthorized"}', {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(validateConfigs(VALID_YAML)).rejects.toThrow(ApiError)
  })
})

// Asserts the common request shape shared by every endpoint: the same-origin
// proxy URL, the X-CoreC-Target forwarding header, and Bearer auth from the
// active connection. Returns the RequestInit for further body/header checks.
function expectCorecRequest(url: string, method?: string) {
  const [callUrl, init] = mockFetch.mock.calls[0]
  expect(callUrl).toBe(url)
  expect(init?.method).toBe(method)
  expect(init?.headers.get('X-CoreC-Target')).toBe('http://127.0.0.1:9090')
  expect(init?.headers.get('Authorization')).toBe('Bearer test-secret-token')
  return init as RequestInit | undefined
}

describe('getServerInfo (GET /)', () => {
  it('requests the proxy root and parses the JSON server info', async () => {
    const info = {
      name: 'corec',
      version: '1.2.3',
      status: 'running',
      time: '2026-01-01T00:00:00Z',
      uptime: '12h',
    }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(info), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getServerInfo()

    expect(result).toEqual(info)
    const init = expectCorecRequest('/corec-proxy/', undefined)
    // getServerInfo sets no Accept header — the client defaults apply.
    expect((init!.headers as Headers).has('Accept')).toBe(false)
  })
})

describe('getConfigs (GET /configs)', () => {
  it('requests /configs and parses the summary JSON', async () => {
    const summary = {
      global: {
        'log-level': 'info',
        api: { listen: '0.0.0.0:9090', 'secret-set': true },
      },
      drivers: [{ name: 'plc1', type: 'modbus-tcp' }],
      transports: [{ name: 'wh1', type: 'http' }],
      rules: [],
    }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(summary), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getConfigs()

    expect(result).toEqual(summary)
    expectCorecRequest('/corec-proxy/configs', undefined)
  })
})

describe('updateConfigs (PUT /configs)', () => {
  it('sends a PUT with the JSON-stringified config body', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))

    const data = { path: '/etc/corec/config.yaml', payload: 'node:\n  id: edge\n' }
    const result = await updateConfigs(data)

    expect(result).toBeUndefined()
    const init = expectCorecRequest('/corec-proxy/configs', 'PUT')
    expect((init!.headers as Headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init?.body as string)).toEqual(data)
  })

  it('throws ApiError on a 500 server error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('internal server error', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    await expect(updateConfigs({ payload: 'x' })).rejects.toThrow(ApiError)
  })
})

describe('patchConfigs (PATCH /configs)', () => {
  it('sends a PATCH with the JSON-stringified patch body', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))

    const data = { 'log-level': 'debug' }
    const result = await patchConfigs(data)

    expect(result).toBeUndefined()
    const init = expectCorecRequest('/corec-proxy/configs', 'PATCH')
    expect((init!.headers as Headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init?.body as string)).toEqual(data)
  })

  it('throws ApiError on a 500 server error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('internal server error', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    await expect(patchConfigs({ 'log-level': 'debug' })).rejects.toThrow(ApiError)
  })
})

describe('getDrivers (GET /drivers)', () => {
  it('requests /drivers and parses the list JSON', async () => {
    const drivers = {
      drivers: [
        {
          name: 'plc1',
          type: 'modbus-tcp',
          state: 2,
          last_read: '2026-01-01T00:00:00Z',
          last_error: '',
          tag_count: 1,
          read_count: 10,
          error_count: 0,
          reconnect_count: 0,
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(drivers), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getDrivers()

    expect(result).toEqual(drivers)
    expectCorecRequest('/corec-proxy/drivers', undefined)
  })
})

describe('getDriver (GET /drivers/:name)', () => {
  it('encodes the driver name and parses the status JSON', async () => {
    const status = {
      name: 'plc 1',
      type: 'modbus-tcp',
      state: 2,
      last_read: '2026-01-01T00:00:00Z',
      last_error: '',
      tag_count: 1,
      read_count: 10,
      error_count: 0,
      reconnect_count: 0,
    }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(status), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getDriver('plc 1')

    expect(result).toEqual(status)
    expectCorecRequest('/corec-proxy/drivers/plc%201', undefined)
  })
})

describe('getDriverTags (GET /drivers/:name/tags)', () => {
  it('parses the tag map JSON', async () => {
    const tags = {
      tags: {
        temp: {
          driver: 'plc1',
          tag: 'temp',
          value: 42.5,
          type: 'float32',
          quality: 0,
          timestamp: '2026-01-01T00:00:00Z',
        },
      },
    }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(tags), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getDriverTags('plc1')

    expect(result).toEqual(tags)
    expectCorecRequest('/corec-proxy/drivers/plc1/tags', undefined)
  })

  it('parses { tags: null } for a driver with no cached values', async () => {
    // CoreC returns {"tags": null} (not 404) for unknown/empty drivers.
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ tags: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getDriverTags('unknown')

    expect(result).toEqual({ tags: null })
    expectCorecRequest('/corec-proxy/drivers/unknown/tags', undefined)
  })
})

describe('getTransports (GET /transports)', () => {
  it('requests /transports and parses the list JSON', async () => {
    const transports = {
      transports: [
        {
          name: 'wh1',
          type: 'http',
          state: 2,
          published: 5,
          failed: 0,
          received: 0,
          last_publish: '2026-01-01T00:00:00Z',
          queue_size: 0,
          dropped_commands: 0,
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(transports), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getTransports()

    expect(result).toEqual(transports)
    expectCorecRequest('/corec-proxy/transports', undefined)
  })
})

describe('getTransport (GET /transports/:name)', () => {
  it('encodes the transport name and parses the status JSON', async () => {
    const status = {
      name: 'web hook 1',
      type: 'http',
      state: 2,
      published: 5,
      failed: 0,
      received: 0,
      last_publish: '2026-01-01T00:00:00Z',
      queue_size: 0,
      dropped_commands: 0,
    }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(status), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getTransport('web hook 1')

    expect(result).toEqual(status)
    expectCorecRequest('/corec-proxy/transports/web%20hook%201', undefined)
  })
})

describe('getTags (GET /tags)', () => {
  it('requests /tags and parses the global tag map JSON', async () => {
    const tags = {
      tags: {
        'plc1.temp': {
          driver: 'plc1',
          tag: 'temp',
          value: 42.5,
          type: 'float32',
          quality: 0,
          timestamp: '2026-01-01T00:00:00Z',
        },
      },
    }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(tags), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getTags()

    expect(result).toEqual(tags)
    expectCorecRequest('/corec-proxy/tags', undefined)
  })
})

describe('writeTag (POST /write)', () => {
  it('sends a POST with the JSON-stringified write command', async () => {
    const writeResponse = { success: true }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(writeResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const cmd = { driver: 'plc1', tag: 'temp', value: 50, type: 'float32' as const }
    const result = await writeTag(cmd)

    expect(result).toEqual(writeResponse)
    const init = expectCorecRequest('/corec-proxy/write', 'POST')
    expect((init!.headers as Headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init?.body as string)).toEqual(cmd)
  })

  it('throws ApiError on a 500 server error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('internal server error', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    await expect(
      writeTag({ driver: 'plc1', tag: 'temp', value: 1, type: 'int16' }),
    ).rejects.toThrow(ApiError)
  })
})

describe('getDeadLetters (GET /write/failed)', () => {
  it('requests /write/failed and parses the dead-letter JSON', async () => {
    const deadLetters = {
      failed_writes: [
        {
          command: { driver: 'plc1', tag: 'temp', value: 50, type: 'float32' },
          error: 'driver disconnected',
          failed_at: '2026-01-01T00:00:00Z',
          attempts: 3,
        },
      ],
      count: 1,
    }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(deadLetters), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getDeadLetters()

    expect(result).toEqual(deadLetters)
    expectCorecRequest('/corec-proxy/write/failed', undefined)
  })
})

describe('getRules (GET /rules)', () => {
  it('requests /rules and parses the rules list JSON', async () => {
    const rules = {
      rules: [
        {
          index: 0,
          name: 'r1',
          type: 'simple',
          match: 'ALL',
          action: 'forward',
          target: 'wh1',
          targets: null,
          priority: 0,
          disabled: false,
          hit_count: 1,
          hit_at: '2026-01-01T00:00:00Z',
          miss_count: 0,
          miss_at: '',
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(rules), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getRules()

    expect(result).toEqual(rules)
    expectCorecRequest('/corec-proxy/rules', undefined)
  })
})

describe('toggleRule (PATCH /rules/disable)', () => {
  it('sends a PATCH with the { name, disabled } body', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))

    const result = await toggleRule('overtemp-alarm', true)

    expect(result).toBeUndefined()
    const init = expectCorecRequest('/corec-proxy/rules/disable', 'PATCH')
    expect((init!.headers as Headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init?.body as string)).toEqual({ name: 'overtemp-alarm', disabled: true })
  })

  it('throws ApiError on a 500 server error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('internal server error', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    await expect(toggleRule('overtemp-alarm', false)).rejects.toThrow(ApiError)
  })
})

describe('getStats (GET /stats)', () => {
  it('requests /stats and parses the engine stats JSON', async () => {
    const stats = {
      status: 'running',
      uptime: 1_000_000_000,
      drivers: 1,
      transports: 1,
      rules: 1,
      total_read: 100,
      total_publish: 50,
      total_errors: 0,
      total_dropped: 0,
      points_per_sec: 10,
    }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(stats), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getStats()

    expect(result).toEqual(stats)
    expectCorecRequest('/corec-proxy/stats', undefined)
  })
})

describe('getMetricsText (GET /metrics)', () => {
  it('requests /metrics and returns the Prometheus text body', async () => {
    const metricsText =
      '# HELP corec_read_count Total reads\n# TYPE corec_read_count counter\ncorec_read_count 100\n'
    mockFetch.mockResolvedValueOnce(
      new Response(metricsText, {
        status: 200,
        headers: { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' },
      }),
    )

    const result = await getMetricsText()

    expect(result).toBe(metricsText)
    expectCorecRequest('/corec-proxy/metrics', undefined)
  })
})

// ─── Server-side config backups (GET /configs/backups*) ────────────────

describe('getConfigBackups (GET /configs/backups)', () => {
  it('requests the list and zod-parses the metadata entries', async () => {
    const backups = {
      backups: [
        {
          name: '1767225600123456789.yaml',
          timestamp: '2026-01-01T00:00:00.123456789Z',
          size: 2048,
        },
        { name: '1767225500000000000.yaml', timestamp: '2025-12-31T23:58:20Z', size: 1987 },
      ],
    }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(backups), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getConfigBackups()

    expect(result).toEqual(backups)
    expectCorecRequest('/corec-proxy/configs/backups', undefined)
  })

  it('parses an empty backup list', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ backups: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getConfigBackups()

    expect(result).toEqual({ backups: [] })
  })

  it('rejects a malformed body (zod boundary)', async () => {
    // Contract drift must surface at the boundary, not render garbage rows.
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ backups: [{ name: 42 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(getConfigBackups()).rejects.toThrow()
  })

  it('throws ApiError on a 500 server error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('internal server error', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    await expect(getConfigBackups()).rejects.toThrow(ApiError)
  })
})

describe('getConfigBackupContent (GET /configs/backups/{name})', () => {
  it('returns the raw YAML text body with the yaml Accept header', async () => {
    const yamlText = 'global:\n  api:\n    secret: "real-secret"\n'
    mockFetch.mockResolvedValueOnce(
      new Response(yamlText, {
        status: 200,
        headers: { 'content-type': 'application/yaml; charset=utf-8' },
      }),
    )

    const result = await getConfigBackupContent('1767225600123456789.yaml')

    expect(result).toBe(yamlText)
    const init = expectCorecRequest(
      '/corec-proxy/configs/backups/1767225600123456789.yaml',
      undefined,
    )
    expect((init!.headers as Headers).get('Accept')).toBe('application/yaml')
  })

  it('encodes the backup name into the path', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('node:\n', {
        status: 200,
        headers: { 'content-type': 'application/yaml' },
      }),
    )

    await getConfigBackupContent('17 67.yaml')

    expect(mockFetch.mock.calls[0][0]).toBe('/corec-proxy/configs/backups/17%2067.yaml')
  })

  it('throws ApiError on a 404 unknown backup', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'config backup not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(getConfigBackupContent('999.yaml')).rejects.toThrow(ApiError)
  })
})

describe('restoreConfigBackup (POST /configs/backups/{name}/restore)', () => {
  it('resolves { outcome: restored } on a 204', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))

    const result = await restoreConfigBackup('1767225600123456789.yaml')

    expect(result).toEqual({ outcome: 'restored' })
    const init = expectCorecRequest(
      '/corec-proxy/configs/backups/1767225600123456789.yaml/restore',
      'POST',
    )
    // No request body — the server reads the backup file itself.
    expect(init?.body).toBeUndefined()
  })

  it('normalizes a 400 validation failure into { outcome: rejected } with the verbatim message', async () => {
    // A backup that no longer passes validation fails BEFORE anything is
    // applied — the message is the answer, not a transport error.
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'config backup failed validation: api.secret must be set' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    )

    const result = await restoreConfigBackup('1767225600123456789.yaml')

    expect(result).toEqual({
      outcome: 'rejected',
      status: 400,
      error: 'config backup failed validation: api.secret must be set',
    })
  })

  it('normalizes a 404 unknown/pruned backup name into { outcome: rejected }', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'config backup not found: 999.yaml' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await restoreConfigBackup('999.yaml')

    expect(result).toEqual({
      outcome: 'rejected',
      status: 404,
      error: 'config backup not found: 999.yaml',
    })
  })

  it('normalizes a 503 no-config-path into { outcome: rejected }', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'no active config path; config backups unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await restoreConfigBackup('1767225600123456789.yaml')

    expect(result).toEqual({
      outcome: 'rejected',
      status: 503,
      error: 'no active config path; config backups unavailable',
    })
  })

  it('throws ApiError on a 500 server error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('internal server error', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    await expect(restoreConfigBackup('1767225600123456789.yaml')).rejects.toThrow(ApiError)
  })
})

// ─── Write history & instance health ──────────────────────────────────
// These endpoints zod-parse the response at the boundary (AGENTS.md:
// backend responses are untrusted), so each describe also covers a
// malformed-body rejection next to the happy path.

describe('getWriteHistory (GET /write/history)', () => {
  it('requests /write/history and parses the newest-first audit entries', async () => {
    const history = {
      writes: [
        {
          timestamp: '2026-01-01T12:00:00.123456789Z',
          driver: 'plc1',
          device: '',
          tag: 'temp',
          value: 50,
          type: 'float32',
          success: true,
          source: 'api',
          remote: '192.168.1.10:51424',
        },
        {
          timestamp: '2026-01-01T11:00:00Z',
          driver: 'plc1',
          device: 'line1',
          tag: 'pump',
          value: true,
          type: 'bool',
          success: false,
          error: 'driver disconnected',
          source: 'command',
        },
      ],
      count: 2,
    }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(history), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getWriteHistory()

    expect(result).toEqual(history)
    expectCorecRequest('/corec-proxy/write/history', undefined)
  })

  it('defaults a missing device field to an empty string (tolerant parse)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          writes: [
            {
              timestamp: '2026-01-01T12:00:00Z',
              driver: 'plc1',
              tag: 'temp',
              value: '50',
              type: 'string',
              success: true,
              source: 'command',
            },
          ],
          count: 1,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    )

    const result = await getWriteHistory()

    expect(result.writes[0].device).toBe('')
    expect(result.count).toBe(1)
  })

  it('rejects an entry whose type is outside the DataType enum (zod boundary)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          writes: [
            {
              timestamp: '2026-01-01T12:00:00Z',
              driver: 'plc1',
              tag: 'temp',
              value: 1,
              type: 'complex128', // not a CoreC DataType
              success: true,
              source: 'api',
            },
          ],
          count: 1,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    )

    await expect(getWriteHistory()).rejects.toThrow()
  })

  it('throws ApiError on a 500 server error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('internal server error', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    await expect(getWriteHistory()).rejects.toThrow(ApiError)
  })

  it('surfaces a 501 from engines without write-history support as ApiError', async () => {
    // CoreC answers 501 (not 500) when the engine does not implement the
    // write auditor — the UI error state shows it like any transport error.
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'write history not supported by this engine' }), {
        status: 501,
        headers: { 'content-type': 'application/json' },
      }),
    )

    let caught: unknown
    try {
      await getWriteHistory()
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).status).toBe(501)
  })
})

describe('getVersion (GET /version)', () => {
  it('requests the public /version endpoint and parses {"version"}', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ version: '0.9.2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getVersion()

    expect(result).toEqual({ version: '0.9.2' })
    // Public route, but the same proxy + Bearer headers as every other
    // endpoint — CoreC ignores the token outside its auth group.
    expectCorecRequest('/corec-proxy/version', undefined)
  })

  it('rejects a body without the version field', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(getVersion()).rejects.toThrow()
  })
})

describe('getHealthzLive (GET /healthz/live)', () => {
  it('requests the public liveness probe and parses {"status":"alive"}', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'alive' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getHealthzLive()

    expect(result).toEqual({ status: 'alive' })
    expectCorecRequest('/corec-proxy/healthz/live', undefined)
  })

  it('rejects an unexpected status value', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'dead' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(getHealthzLive()).rejects.toThrow()
  })
})

describe('getHealthzReady (GET /healthz/ready)', () => {
  it('normalizes the 200 ready body to { ready: true }', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ready' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getHealthzReady()

    expect(result).toEqual({ ready: true })
    expectCorecRequest('/corec-proxy/healthz/ready', undefined)
  })

  it('normalizes a 503 not-ready body into { ready: false, reason, components }', async () => {
    const notReady = {
      status: 'not_ready',
      reason: 'no drivers connected',
      components: {
        drivers: [{ name: 'plc1', connected: false }],
        transports: [{ name: 'wh1', connected: true }],
      },
    }
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(notReady), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await getHealthzReady()

    expect(result).toEqual({
      ready: false,
      reason: 'no drivers connected',
      components: notReady.components,
    })
  })

  it('re-throws when the 503 body is not the not-ready shape', async () => {
    // A 503 from a reverse proxy (HTML error page) is a contract
    // violation, not a readiness state — surface it as an ApiError.
    mockFetch.mockResolvedValueOnce(
      new Response('<html>Bad Gateway</html>', {
        status: 503,
        headers: { 'content-type': 'text/html' },
      }),
    )

    let caught: unknown
    try {
      await getHealthzReady()
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).status).toBe(503)
  })

  it('throws ApiError on a 500 server error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('internal server error', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    await expect(getHealthzReady()).rejects.toThrow(ApiError)
  })
})

describe('postDriverTest (POST /drivers/test)', () => {
  const settings = { host: '10.0.0.5', port: 502, 'slave-id': 1 }

  function mockJson(status: number, body: unknown) {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }

  it('sends type+settings and parses the connected 200 body', async () => {
    mockJson(200, {
      ok: true,
      connected: true,
      latency_ms: 12,
      driver_type: 'modbus-tcp',
    })

    const result = await postDriverTest('modbus-tcp', settings)

    expect(result).toEqual({
      outcome: 'completed',
      data: { ok: true, connected: true, latency_ms: 12, driver_type: 'modbus-tcp' },
    })
    const init = expectCorecRequest('/corec-proxy/drivers/test', 'POST')
    expect((init!.headers as Headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init?.body as string)).toEqual({ type: 'modbus-tcp', settings })
  })

  it('includes the optional name in the request body when provided', async () => {
    mockJson(200, { ok: true, connected: true, latency_ms: 3, driver_type: 's7' })

    await postDriverTest('s7', { rack: 0, slot: 1 }, 'plc-line-2-probe')

    const init = mockFetch.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({
      type: 's7',
      settings: { rack: 0, slot: 1 },
      name: 'plc-line-2-probe',
    })
  })

  it('normalizes a failed probe (200 ok:false) into completed with the verbatim error', async () => {
    // A completed run with connected=false is a successful TEST, not a
    // server error — the 5s server timeout surfaces the same way.
    mockJson(200, {
      ok: false,
      connected: false,
      error: 'driver test timed out after 5s',
      latency_ms: 5001,
      driver_type: 'modbus-tcp',
    })

    const result = await postDriverTest('modbus-tcp', settings)

    expect(result.outcome).toBe('completed')
    expect(result.outcome === 'completed' && result.data.connected).toBe(false)
    expect(result.outcome === 'completed' && result.data.error).toBe(
      'driver test timed out after 5s',
    )
  })

  it('normalizes a 400 rejection into { outcome: rejected } with the server message', async () => {
    // Unknown driver type / settings the factory refuses → 400 with the
    // reason in the body. It is the answer, so it resolves (like
    // validateConfigs normalizes its 400s) instead of throwing.
    mockJson(400, { error: 'unknown driver type: no-such-type' })

    const result = await postDriverTest('no-such-type', {})

    expect(result).toEqual({ outcome: 'rejected', error: 'unknown driver type: no-such-type' })
  })

  it('throws ApiError on a 500 server error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('internal server error', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    await expect(postDriverTest('modbus-tcp', settings)).rejects.toThrow(ApiError)
  })

  it('rejects a 200 body missing required fields (zod boundary)', async () => {
    // Contract drift (e.g. a proxy returning a different shape) must
    // surface at the boundary, not render garbage in the wizard.
    mockJson(200, { ok: true })

    await expect(postDriverTest('modbus-tcp', settings)).rejects.toThrow()
  })
})

describe('postRulesPreview (POST /rules/preview)', () => {
  const point: PreviewDataPoint = {
    driver: 'plc1',
    device: '',
    group: 'g1',
    tag: 'temperature',
    value: 96.5,
    type: 'float64',
    quality: 0,
    timestamp: '2024-09-08T10:30:00Z',
  }

  function mockJson(status: number, body: unknown) {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }

  it('sends match+point and parses {matched:true}', async () => {
    mockJson(200, { matched: true })

    const result = await postRulesPreview("tag == 'temperature' && value > 95", point)

    expect(result).toEqual({ outcome: 'evaluated', matched: true })
    const init = expectCorecRequest('/corec-proxy/rules/preview', 'POST')
    expect((init!.headers as Headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init?.body as string)).toEqual({
      match: "tag == 'temperature' && value > 95",
      point,
    })
  })

  it('omits point from the body when none is provided (zero-value point server-side)', async () => {
    mockJson(200, { matched: false })

    const result = await postRulesPreview('value > 0')

    expect(result).toEqual({ outcome: 'evaluated', matched: false })
    const init = mockFetch.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ match: 'value > 0' })
  })

  it('defaults a missing device/group to "" (tolerant outgoing parse)', async () => {
    mockJson(200, { matched: true })

    await postRulesPreview('ALL', { ...point, device: undefined, group: undefined })

    const init = mockFetch.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string).point).toEqual({ ...point, device: '', group: '' })
  })

  it('normalizes a 400 compile error into { outcome: error } with the verbatim message', async () => {
    // The backend returns expr's compile error unmasked BY DESIGN — the
    // frontend shows it next to the expression editor.
    mockJson(400, {
      error:
        'failed to create rule preview: invalid match expression "tag ==": compile expression "tag ==" (translated: "tag =="): unexpected token EOF (1:6)',
    })

    const result = await postRulesPreview('tag ==', point)

    expect(result).toEqual({
      outcome: 'error',
      status: 400,
      error:
        'failed to create rule preview: invalid match expression "tag ==": compile expression "tag ==" (translated: "tag =="): unexpected token EOF (1:6)',
    })
  })

  it('normalizes a 501 unsupported-engine into { outcome: error }', async () => {
    mockJson(501, { error: 'rule preview not supported by this engine' })

    const result = await postRulesPreview('ALL')

    expect(result).toEqual({
      outcome: 'error',
      status: 501,
      error: 'rule preview not supported by this engine',
    })
  })

  it('throws ApiError on a 500 server error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('internal server error', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    await expect(postRulesPreview('ALL', point)).rejects.toThrow(ApiError)
  })

  it('rejects a malformed 200 body (zod boundary)', async () => {
    mockJson(200, { result: true })

    await expect(postRulesPreview('ALL', point)).rejects.toThrow()
  })

  it('rejects a sample point with an unknown DataType BEFORE any request is sent', async () => {
    // The outgoing point is parsed at the boundary — a malformed form
    // payload must never reach the backend.
    await expect(
      postRulesPreview('ALL', { ...point, type: 'complex128' as PreviewDataPoint['type'] }),
    ).rejects.toThrow()

    expect(mockFetch).not.toHaveBeenCalled()
  })
})
