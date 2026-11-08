// @vitest-environment jsdom
// Execution tests for the assistant's tools: what each verb sends to the
// control plane, and what it hands back to the model.
//
// tools.test.ts checks the REGISTRY (which verbs exist, read vs write). This
// file checks the VERBS themselves. The distinction is not academic: the
// registry tests were green while tools.ts sat at 8% line coverage, because
// nothing in them ever called execute().
//
// The seam is apiRequest from @/api/client. Below it is the dashboard's own HTTP
// client, which has its own tests; above it is the tool, which is what is under
// test here. apiRequest throws ApiError for non-2xx, so stubbing it with an
// ApiError reproduces exactly what a refused write looks like to a tool.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  const { ApiError: RealApiError } = actual
  return {
    ...actual,
    apiRequest: (path: string, opts?: unknown) => apiRequestMock(path, opts),
    // Keep the real ApiError: error classification (reasonOf) is what these
    // tests are about, and a stubbed error class would test the stub.
    ApiError: RealApiError,
  }
})

const apiRequestMock = vi.fn<(path: string, opts?: unknown) => Promise<unknown>>()

let assistantTools: typeof import('@/features/assistant/tools').assistantTools
let ApiErrorCtor: typeof import('@/api/client').ApiError

beforeEach(async () => {
  apiRequestMock.mockReset()
  const mod = await import('@/features/assistant/tools')
  assistantTools = mod.assistantTools
  const client = await import('@/api/client')
  ApiErrorCtor = client.ApiError
})

afterEach(() => {
  vi.clearAllMocks()
})

type Tool = ReturnType<typeof assistantTools>[number]

function spec(name: string): Tool {
  const found = assistantTools(true).find((t) => t.name === name)
  if (!found) throw new Error(`tool ${name} not registered`)
  return found
}

function body(res: { content: string }): Record<string, unknown> {
  return JSON.parse(res.content) as Record<string, unknown>
}

describe('tool execution: reads', () => {
  it('list_drivers maps the REST shape and counts the result', async () => {
    apiRequestMock.mockResolvedValue({
      drivers: [{ name: 'plc1', type: 'modbus', state: 2, last_error: '', tag_count: 7 }],
    })
    const res = await spec('list_drivers').execute({})
    expect(res.failed).toBeUndefined()
    expect(body(res).drivers).toEqual([
      { name: 'plc1', type: 'modbus', state: 2, last_error: '', tag_count: 7 },
    ])
    expect(String(res.summary)).toContain('1')
  })

  it('driver_status refuses an empty name without asking the server', async () => {
    const res = await spec('driver_status').execute({ name: '  ' })
    expect(res.failed).toBe(true)
    expect(apiRequestMock).not.toHaveBeenCalled()
  })

  it('list_tags treats {tags: null} as an answer, not a failure', async () => {
    // The per-driver route answers null for an unknown driver rather than 404.
    apiRequestMock.mockResolvedValue({ tags: null })
    const res = await spec('list_tags').execute({ driver: 'ghost' })
    expect(res.failed).toBeUndefined()
    expect(body(res).tags).toBeNull()
    expect(String(body(res).note)).toContain('ghost')
  })

  it('list_tags caps a large snapshot and says how many it hid', async () => {
    const snapshot: Record<string, unknown> = {}
    for (let i = 0; i < 60; i++) snapshot[`t${i}`] = { value: i }
    apiRequestMock.mockResolvedValue({ tags: snapshot })
    const res = await spec('list_tags').execute({})
    // 60 matched, 50 returned. Both are reported, under names that say which is
    // which: a bare `count` beside a truncated `tags` reads as tags.length, and a
    // model that believes it holds all 60 answers questions about the other 10
    // with "not in cache" instead of "not shown".
    expect(body(res).matched).toBe(60)
    expect(body(res).returned).toBe(50)
    expect(Object.keys(body(res).tags as object)).toHaveLength(50)
    expect(String(body(res).note)).toContain('50')
  })

  it('list_tags under exact reports a miss as empty, never the neighbour', async () => {
    apiRequestMock.mockResolvedValue({ tags: { sp: { value: 1 }, sp1: { value: 2 } } })
    const res = await spec('list_tags').execute({ tag: 'sp', exact: true })
    expect(Object.keys(body(res).tags as object)).toEqual(['sp'])
  })

  it('list_tags reports returned == tags.length, and matched == returned under the cap', async () => {
    // Both counts are derivable from the payload, so asserting them protects
    // nothing on its own. Their job is to stay equal to it: `returned` is the only
    // one of the two that cannot be re-derived from `tags` alone in the truncated
    // case (it equals the cap by argument, not by observation), which is exactly
    // the case where a drifting count would do the most damage.
    const snapshot: Record<string, unknown> = {}
    for (let i = 0; i < 7; i++) snapshot[`t${i}`] = { value: i }
    apiRequestMock.mockResolvedValue({ tags: snapshot })

    const res = await spec('list_tags').execute({})
    const b = body(res)
    expect(b.matched).toBe(7)
    expect(b.returned).toBe(7)
    expect(b.returned).toBe(Object.keys(b.tags as object).length)
    expect(b.note).toBeUndefined()
  })

  it('list_alerts filters by driver locally', async () => {
    apiRequestMock.mockResolvedValue({
      alerts: [
        {
          key: 'k1',
          rule: 'r1',
          driver: 'a',
          tag: 't',
          quality: 3,
          first_fired: '',
          last_fired: '',
          count: 1,
          acked: false,
        },
        {
          key: 'k2',
          rule: 'r2',
          driver: 'b',
          tag: 't',
          quality: 3,
          first_fired: '',
          last_fired: '',
          count: 2,
          acked: true,
        },
      ],
      history: [],
      active_count: 2,
      acked_count: 1,
    })
    const res = await spec('list_alerts').execute({ driver: 'b' })
    const alerts = body(res).alerts as { driver: string }[]
    expect(alerts).toHaveLength(1)
    expect(alerts[0].driver).toBe('b')
  })

  it('list_alerts counts the filtered set, and keeps the engine-wide total apart', async () => {
    // Three alerts on the engine, one of them on driver b. The engine answers
    // active_count: 3 -- it has no idea a driver filter is coming, and it is
    // correct: three alerts ARE active. Repeating that number beside the
    // one-element `alerts` array would say "b has 3 active alerts" when b has
    // one. Both numbers are true; they are true about different sets, and only
    // the names can tell the reader which is which.
    apiRequestMock.mockResolvedValue({
      alerts: [
        {
          key: 'k1',
          rule: 'r1',
          driver: 'a',
          tag: 't',
          quality: 3,
          count: 1,
          acked: false,
          first_fired: '',
          last_fired: '',
        },
        {
          key: 'k2',
          rule: 'r2',
          driver: 'b',
          tag: 't',
          quality: 3,
          count: 2,
          acked: true,
          first_fired: '',
          last_fired: '',
        },
        {
          key: 'k3',
          rule: 'r3',
          driver: 'c',
          tag: 't',
          quality: 3,
          count: 5,
          acked: false,
          first_fired: '',
          last_fired: '',
        },
      ],
      history: [],
      active_count: 3,
      acked_count: 1,
    })

    const filtered = body(await spec('list_alerts').execute({ driver: 'b' }))
    expect(filtered.active_count).toBe(1) // the answer to "active for b"
    expect(filtered.acked_count).toBe(1)
    expect(filtered.unacked_count).toBe(0)
    expect(filtered.total_active).toBe(3) // the answer to "active anywhere"
    expect(filtered.alerts as unknown[]).toHaveLength(1)

    const unfiltered = body(await spec('list_alerts').execute({}))
    expect(unfiltered.active_count).toBe(3)
    expect(unfiltered.acked_count).toBe(1)
    expect(unfiltered.unacked_count).toBe(2)
    expect(unfiltered.total_active).toBe(3)
  })

  it('get_configs returns the YAML verbatim, not a quoted blob', async () => {
    apiRequestMock.mockResolvedValue('global:\n  engine:\n    workers: 4\n')
    const res = await spec('get_configs').execute({})
    expect(res.content).toContain('workers: 4')
    expect(res.content.startsWith('"')).toBe(false)
  })

  it('validate_configs refuses an empty payload without asking the server', async () => {
    const res = await spec('validate_configs').execute({})
    expect(res.failed).toBe(true)
    expect(apiRequestMock).not.toHaveBeenCalled()
  })

  it('validate_configs passes the server verdict through', async () => {
    apiRequestMock.mockResolvedValue({ valid: false, error: 'driver x: address cannot be empty' })
    const res = await spec('validate_configs').execute({ payload: 'drivers: []' })
    expect(String(res.summary)).toContain('invalid')
    expect(JSON.stringify(body(res))).toContain('address cannot be empty')
  })
})

describe('tool execution: writes', () => {
  it('write_tag posts the command verbatim, with method POST', async () => {
    apiRequestMock.mockResolvedValue({ ok: true })
    await spec('write_tag').execute({ driver: 'plc1', tag: 'sp', type: 'bool', value: true })

    const [path, opts] = apiRequestMock.mock.calls[0] as [string, { method: string; body: string }]
    expect(path).toBe('/write')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ driver: 'plc1', tag: 'sp', type: 'bool', value: true })
  })

  it('write_tag passes raw through only when it was asked for', async () => {
    apiRequestMock.mockResolvedValue({ ok: true })
    await spec('write_tag').execute({ driver: 'd', tag: 't', type: 'int16', value: 5 })
    expect(
      JSON.parse((apiRequestMock.mock.calls[0][1] as { body: string }).body),
    ).not.toHaveProperty('raw')

    apiRequestMock.mockClear()
    await spec('write_tag').execute({ driver: 'd', tag: 't', type: 'int16', value: 5, raw: true })
    expect(JSON.parse((apiRequestMock.mock.calls[0][1] as { body: string }).body)).toHaveProperty(
      'raw',
      true,
    )
  })

  it('pause_driver POSTs to the driver it was given', async () => {
    apiRequestMock.mockResolvedValue(undefined)
    const res = await spec('pause_driver').execute({ name: 'plc1' })
    expect(String(apiRequestMock.mock.calls[0][0])).toBe('/drivers/plc1/pause')
    expect(res.failed).toBeUndefined()
  })

  it('ack_alert sends the key', async () => {
    apiRequestMock.mockResolvedValue(undefined)
    await spec('ack_alert').execute({ key: 'rule|drv|tag' })
    const [path, opts] = apiRequestMock.mock.calls[0] as [string, { body: string }]
    expect(path).toBe('/alerts/ack')
    expect(JSON.parse(opts.body)).toEqual({ key: 'rule|drv|tag' })
  })
})

describe('tool execution: refusals reach the model intact', () => {
  it('a read-only rejection arrives as the engine worded it, not "failed"', async () => {
    // This string is the whole point: a model that reads "failed" retries or
    // apologizes, a model that reads this explains the write protection to the
    // operator. run() must not wrap it.
    const engineSaid = 'tag "sp" is read-only (protect: read-only)'
    // Constructed the way apiRequest constructs it, not the way that is
    // convenient: the TRANSPORT summary is .message, the engine's sentence is
    // the response body. The earlier version passed only .message, which let a
    // reasonOf that read .message alone look correct here while discarding the
    // engine's words on every real request.
    apiRequestMock.mockRejectedValue(
      new ApiErrorCtor(
        400,
        'API request failed: 400 Bad Request',
        JSON.stringify({ error: engineSaid }),
      ),
    )

    const res = await spec('write_tag').execute({
      driver: 'd',
      tag: 'sp',
      type: 'bool',
      value: true,
    })

    expect(res.failed).toBe(true)
    expect(res.toolError).toBe(engineSaid)
    expect(String(body(res).error)).toBe(engineSaid)
  })

  it('a 429 keeps its status and Retry-After reason', async () => {
    const engineSaid = 'tag "sp" is write-paced (write-min-interval 200ms)'
    apiRequestMock.mockRejectedValue(
      new ApiErrorCtor(
        429,
        'API request failed: 429 Too Many Requests',
        JSON.stringify({ error: engineSaid }),
      ),
    )

    const res = await spec('write_tag').execute({
      driver: 'd',
      tag: 'sp',
      type: 'bool',
      value: true,
    })

    expect(res.failed).toBe(true)
    expect(res.toolError).toContain('write-paced')
    expect(String(res.toolError)).toContain('200ms')
  })

  it('a non-Api error still carries its message', async () => {
    apiRequestMock.mockRejectedValue(new Error('network down'))
    const res = await spec('list_drivers').execute({})
    expect(res.failed).toBe(true)
    expect(res.toolError).toBe('network down')
  })

  it('a huge payload is clipped and says so', async () => {
    // get_configs hands back the raw YAML string; a padded comment is exactly
    // the shape a real large config has.
    apiRequestMock.mockResolvedValue('# ' + 'x'.repeat(70 * 1024) + '\nglobal: {}\n')
    const res = await spec('get_configs').execute({})
    // The previous form required res.content.length > 64 * 1024 -- it asserted
    // that the result BREACH the cap, on the theory that anything under the cap
    // meant no clipping had happened. But a hard limit the clipped output
    // exceeds by construction is not a hard limit, and the 80-byte notice this
    // test was bending over backward to allow was the very thing breaking every
    // cut. "Clipped" means: shorter than the input, and no longer than the cap
    // once the notice is counted.
    expect(new TextEncoder().encode(res.content).length).toBeLessThanOrEqual(64 * 1024)
    expect(res.content.length).toBeLessThan(70 * 1024)
    expect(res.content).toContain('truncated')
    expect(res.content).toContain('narrow the query')
  })
})
