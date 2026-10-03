import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveConnection } from '@/api/activeConnection'
import { ApiError } from '@/api/client'
import {
  getConfigs,
  getConfigsRaw,
  getDeadLetters,
  getDriver,
  getDrivers,
  getDriverTags,
  getMetricsText,
  getRules,
  getServerInfo,
  getStats,
  getTags,
  getTransport,
  getTransports,
  patchConfigs,
  toggleRule,
  updateConfigs,
  validateConfigs,
  writeTag,
} from '@/api/endpoints/index'

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
    const errBody = JSON.stringify({
      valid: false,
      error: 'config validation failed: no data source',
    })
    mockFetch.mockResolvedValueOnce(
      new Response(errBody, {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await validateConfigs('node:\n  id: edge\n')

    expect(result).toEqual({
      valid: false,
      error: 'config validation failed: no data source',
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
  it('sends a PATCH with the { index, disabled } body', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))

    const result = await toggleRule(2, true)

    expect(result).toBeUndefined()
    const init = expectCorecRequest('/corec-proxy/rules/disable', 'PATCH')
    expect((init!.headers as Headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init?.body as string)).toEqual({ index: 2, disabled: true })
  })

  it('throws ApiError on a 500 server error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('internal server error', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    await expect(toggleRule(0, false)).rejects.toThrow(ApiError)
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
