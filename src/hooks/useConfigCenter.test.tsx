// @vitest-environment jsdom
/**
 * useConfigCenter — C-D1 regression coverage.
 *
 * Scenario under test (UX audit C-D1, P0): the Config Center keeps two
 * manually bridged states — the structured form side (configStore working
 * config) and the raw YAML editor string. The operator edits the form,
 * switches to YAML, edits different lines there, and hot-reloads. The old
 * code called markSaved() after the PUT, which marked the form edits that
 * were never sent as "saved", dismissed the unsaved-changes banner, and let
 * the edits silently evaporate. The fix records the applied YAML as the
 * saved baseline while keeping divergent form edits pending.
 *
 * Also covers the mode-switch bridge and the hot-reload acknowledgement
 * guard that make the evaporation path structurally unreachable.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConfigCenter } from '@/hooks/useConfigCenter'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'
import { useConnectionStore } from '@/stores/connectionStore'

// apiRequest reads the active connection singleton for baseUrl/secret.
vi.mock('@/api/activeConnection', () => ({
  getActiveConnection: () => ({
    instanceId: 'test-instance',
    baseUrl: 'http://test',
    secret: 'test-secret',
  }),
  setActiveConnection: vi.fn(),
}))

const SERVER_YAML = `global:
  log-level: info
  api:
    listen: 0.0.0.0:9090
    secret: test-secret
drivers:
  - name: d1
    type: modbus-tcp
    settings:
      host: 10.0.0.1
    tags:
      - name: t1
        address: "40001"
        type: float32
`
// YAML-mode edit: log level only — does NOT contain the form-side edit.
const YAML_WITH_OTHER_EDIT = `global:
  log-level: debug
  api:
    listen: 0.0.0.0:9090
    secret: test-secret
drivers:
  - name: d1
    type: modbus-tcp
    settings:
      host: 10.0.0.1
    tags:
      - name: t1
        address: "40001"
        type: float32
`

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function route(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

beforeAll(() => {
  vi.stubGlobal('fetch', fetchMock)
  // Pin English so status/banner strings are deterministic.
  void i18n.changeLanguage('en')
})

beforeEach(() => {
  localStorage.clear()
  useConfigStore.setState({
    workingConfig: null,
    savedConfig: null,
    dirty: false,
    error: null,
  })
  useConnectionStore.getState().setConnected(true)

  const putCalls: string[] = []
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = route(input)
    const method = init?.method ?? 'GET'
    if (url.includes('/configs/raw')) {
      return Promise.resolve(
        new Response(SERVER_YAML, { status: 200, headers: { 'content-type': 'application/yaml' } }),
      )
    }
    if (url.includes('/configs/validate')) {
      return Promise.resolve(jsonResponse({ valid: true, warnings: [] }))
    }
    if (url.includes('/configs') && method === 'PUT') {
      putCalls.push(String(init?.body ?? ''))
      return Promise.resolve(new Response('', { status: 200 }))
    }
    if (url.includes('/configs')) {
      // GET /configs — overview summary.
      return Promise.resolve(jsonResponse({ global: { 'log-level': 'info' } }))
    }
    return Promise.resolve(jsonResponse({}))
  })
  fetchMock.mock.calls.length = 0
  // Expose the captured PUT payloads to assertions via the mock itself.
  ;(fetchMock as unknown as { putCalls: string[] }).putCalls = putCalls
})

// vitest.config.ts has no `globals: true`, so @testing-library/react's
// auto-cleanup never registers — clean up explicitly between tests.
afterEach(() => {
  cleanup()
  fetchMock.mockClear()
  vi.clearAllMocks()
})

function putPayloads(): string[] {
  const calls = (fetchMock as unknown as { putCalls?: string[] }).putCalls ?? []
  const all = fetchMock.mock.calls.filter(
    (c) => (c[1] as RequestInit | undefined)?.method === 'PUT',
  )
  // The routed implementation recorded payloads; fall back to raw calls.
  return calls.length > 0 ? calls : all.map((c) => String((c[1] as RequestInit)?.body ?? ''))
}

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  return Wrapper
}

/** Mount the hook and wait for the auto-load of the server YAML. */
async function mountSeeded() {
  const wrapper = createWrapper()
  const rendered = renderHook(() => useConfigCenter(), { wrapper })
  await waitFor(() => expect(rendered.result.current.yamlContent).toBe(SERVER_YAML))
  await waitFor(() => expect(useConfigStore.getState().savedConfig).not.toBeNull())
  return rendered
}

describe('useConfigCenter — C-D1 evaporation regression', () => {
  it('a YAML-mode apply does not mark divergent form edits as saved', async () => {
    const { result } = await mountSeeded()

    // The operator edits the form side (engine workers)…
    act(() => {
      useConfigStore.getState().updateGlobalField('engine.workers', 8)
    })
    expect(result.current.configDirty).toBe(true)
    // …then edits DIFFERENT lines in the YAML editor and applies that.
    act(() => {
      result.current.setYamlContent(YAML_WITH_OTHER_EDIT)
    })

    await act(async () => {
      await result.current.handleYamlApplyConfirm()
    })

    // The PUT carried the editor YAML (without the form edit)…
    const payloads = putPayloads()
    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toContain('log-level: debug')
    expect(payloads[0]).not.toContain('workers: 8')

    const s = useConfigStore.getState()
    // …the applied YAML became the saved baseline…
    expect(s.savedConfig?.global?.['log-level']).toBe('debug')
    // …and the form edit was NOT swallowed: it survives as a pending edit
    // with the unsaved-changes banner (dirty) still telling the truth.
    expect(s.workingConfig?.global?.engine?.workers).toBe(8)
    expect(s.dirty).toBe(true)
    expect(result.current.configDirty).toBe(true)
  })

  it('a YAML-mode apply adopts the applied YAML when the form side has no divergent edits', async () => {
    const { result } = await mountSeeded()
    act(() => {
      result.current.setYamlContent(YAML_WITH_OTHER_EDIT)
    })
    await act(async () => {
      await result.current.handleYamlApplyConfirm()
    })
    const s = useConfigStore.getState()
    expect(s.workingConfig?.global?.['log-level']).toBe('debug')
    expect(s.dirty).toBe(false)
  })
})

describe('useConfigCenter — C-D1 mode-switch bridge', () => {
  it('switching modes with diverged content opens the bridge instead of switching', async () => {
    const { result } = await mountSeeded()
    act(() => {
      useConfigStore.getState().updateGlobalField('engine.workers', 8)
    })

    act(() => {
      result.current.requestModeSwitch('yaml')
    })
    expect(result.current.bridgeTarget).toBe('yaml')
    expect(result.current.mode).toBe('form')

    // "Keep form (overwrite YAML)": the editor adopts the working config,
    // so the form edits ARE part of any subsequent YAML apply.
    act(() => {
      result.current.bridgeOverwrite()
    })
    expect(result.current.bridgeTarget).toBeNull()
    expect(result.current.mode).toBe('yaml')
    expect(result.current.yamlContent).toContain('workers: 8')
    expect(result.current.configDirty).toBe(true)
  })

  it('bridgeImport parses the editor YAML into the form side and switches', async () => {
    const { result } = await mountSeeded()
    act(() => {
      result.current.setYamlContent(YAML_WITH_OTHER_EDIT)
    })
    act(() => {
      result.current.requestModeSwitch('yaml')
    })
    expect(result.current.bridgeTarget).toBe('yaml')

    act(() => {
      result.current.bridgeImport()
    })
    expect(result.current.bridgeTarget).toBeNull()
    expect(result.current.mode).toBe('yaml')
    const s = useConfigStore.getState()
    expect(s.workingConfig?.global?.['log-level']).toBe('debug')
  })

  it('switching modes with consistent content switches directly (no bridge)', async () => {
    const { result } = await mountSeeded()
    act(() => {
      result.current.requestModeSwitch('yaml')
    })
    expect(result.current.bridgeTarget).toBeNull()
    expect(result.current.mode).toBe('yaml')
  })

  it('bridgeCancel keeps the current mode and both states untouched', async () => {
    const { result } = await mountSeeded()
    act(() => {
      useConfigStore.getState().updateGlobalField('engine.workers', 8)
    })
    act(() => {
      result.current.requestModeSwitch('yaml')
    })
    act(() => {
      result.current.bridgeCancel()
    })
    expect(result.current.bridgeTarget).toBeNull()
    expect(result.current.mode).toBe('form')
    expect(useConfigStore.getState().workingConfig?.global?.engine?.workers).toBe(8)
  })
})

describe('useConfigCenter — C-D1 hot-reload acknowledgement guard', () => {
  it('hot reload with divergent form edits asks for acknowledgement first', async () => {
    const { result } = await mountSeeded()
    act(() => {
      useConfigStore.getState().updateGlobalField('engine.workers', 8)
    })
    act(() => {
      result.current.setYamlContent(YAML_WITH_OTHER_EDIT)
    })

    act(() => {
      result.current.handleHotReload()
    })
    expect(result.current.applyGuardOpen).toBe(true)
    expect(result.current.yamlApplyOpen).toBe(false)

    act(() => {
      result.current.applyGuardProceed()
    })
    expect(result.current.applyGuardOpen).toBe(false)
    expect(result.current.yamlApplyOpen).toBe(true)
  })

  it('hot reload with consistent content opens the apply dialog directly', async () => {
    const { result } = await mountSeeded()
    act(() => {
      result.current.handleHotReload()
    })
    expect(result.current.applyGuardOpen).toBe(false)
    expect(result.current.yamlApplyOpen).toBe(true)
  })
})
