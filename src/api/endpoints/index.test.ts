import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveConnection } from '@/api/activeConnection'
import { ApiError } from '@/api/client'
import { getConfigsRaw, validateConfigs } from '@/api/endpoints/index'

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
    expect(init?.headers.get('Content-Type')).toBe('application/json')
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
