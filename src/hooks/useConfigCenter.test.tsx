// @vitest-environment jsdom
/**
 * useConfigCenter — regression coverage.
 *
 * Scenario under test (P0): the Config Center keeps two
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
import { CONFIG_TEMPLATES } from '@/lib/configTemplates'
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
    seedStatus: 'idle',
    seedError: null,
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

// Module-level test provider (biome 2.6 noComponentHookFactories: a
// component defined inside a function remounts its subtree on every
// parent render — in tests that would silently reset hook state).
function TestProviders({ client, children }: { client: QueryClient; children: React.ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  // Anonymous bound arrow (biome 2.6 noComponentHookFactories): the
  // named component lives at module level; this arrow only injects the
  // per-test client.
  return ({ children }: { children: React.ReactNode }) => (
    <TestProviders client={qc}>{children}</TestProviders>
  )
}

/** Mount the hook and wait for the auto-load of the server YAML. */
async function mountSeeded() {
  const wrapper = createWrapper()
  const rendered = renderHook(() => useConfigCenter(), { wrapper })
  await waitFor(() => expect(rendered.result.current.yamlContent).toBe(SERVER_YAML))
  await waitFor(() => expect(useConfigStore.getState().savedConfig).not.toBeNull())
  return rendered
}

describe('useConfigCenter — evaporation regression', () => {
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

describe('useConfigCenter — mode-switch bridge', () => {
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

describe('useConfigCenter — hot-reload acknowledgement guard', () => {
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

describe('useConfigCenter — seed-failure guard', () => {
  // When GET /configs/raw fails, AppShell's useAutoLoadConfig flips the
  // store to seedStatus 'failed'. The Config Center must then refuse the
  // hot-reload path — the editor still holds DEFAULT_SAMPLE_YAML and a PUT
  // would replace the (unknown) running config with the sample.
  function mockRawFailure() {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = route(input)
      if (url.includes('/configs/raw')) {
        return Promise.resolve(
          new Response('{"error":"backend restarting"}', {
            status: 503,
            headers: { 'content-type': 'application/json' },
          }),
        )
      }
      if (url.includes('/configs') && (init?.method ?? 'GET') === 'PUT') {
        ;(fetchMock as unknown as { putCalls: string[] }).putCalls.push(String(init?.body ?? ''))
        return Promise.resolve(new Response('', { status: 200 }))
      }
      return Promise.resolve(jsonResponse({}))
    })
  }

  it('hot reload is refused while the server config failed to load', async () => {
    mockRawFailure()
    useConfigStore.setState({ seedStatus: 'failed', seedError: 'backend restarting' })
    const wrapper = createWrapper()
    const { result } = renderHook(() => useConfigCenter(), { wrapper })
    // Wait for the failed fetch to settle (editor keeps the sample YAML).
    await waitFor(() => expect(result.current.seedLoadFailed).toBe(true))

    act(() => {
      result.current.handleHotReload()
    })
    expect(result.current.yamlApplyOpen).toBe(false)
    expect(result.current.applyGuardOpen).toBe(false)
    expect(result.current.statusMsg?.type).toBe('error')

    // Even a direct confirm must not PUT.
    await act(async () => {
      await result.current.handleYamlApplyConfirm()
    })
    expect(putPayloads()).toHaveLength(0)
    expect(result.current.yamlApplyError).toBeTruthy()
  })

  it('hot reload works again after the seed is retried successfully', async () => {
    let failing = true
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = route(input)
      if (url.includes('/configs/raw')) {
        return failing
          ? Promise.resolve(
              new Response('{"error":"backend restarting"}', {
                status: 503,
                headers: { 'content-type': 'application/json' },
              }),
            )
          : Promise.resolve(
              new Response(SERVER_YAML, {
                status: 200,
                headers: { 'content-type': 'application/yaml' },
              }),
            )
      }
      if (url.includes('/configs') && (init?.method ?? 'GET') === 'PUT') {
        ;(fetchMock as unknown as { putCalls: string[] }).putCalls.push(String(init?.body ?? ''))
        return Promise.resolve(new Response('', { status: 200 }))
      }
      return Promise.resolve(jsonResponse({}))
    })
    useConfigStore.setState({ seedStatus: 'failed', seedError: 'backend restarting' })
    const wrapper = createWrapper()
    const { result } = renderHook(() => useConfigCenter(), { wrapper })
    await waitFor(() => expect(result.current.seedLoadFailed).toBe(true))

    failing = false
    act(() => {
      result.current.retrySeed()
    })
    await waitFor(() => expect(result.current.yamlContent).toBe(SERVER_YAML))
    await waitFor(() => expect(result.current.seedLoadFailed).toBe(false))

    act(() => {
      result.current.handleHotReload()
    })
    expect(result.current.yamlApplyOpen).toBe(true)
  })
})

describe('useConfigCenter — persistent validation warnings', () => {
  it('warnings land in the persistent result block, not the auto-dismiss strip', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = route(input)
      if (url.includes('/configs/raw')) {
        return Promise.resolve(
          new Response(SERVER_YAML, {
            status: 200,
            headers: { 'content-type': 'application/yaml' },
          }),
        )
      }
      if (url.includes('/configs/validate')) {
        return Promise.resolve(
          jsonResponse({
            valid: true,
            warnings: ['idle mode: no data source', 'idle mode: no transport'],
          }),
        )
      }
      return Promise.resolve(jsonResponse({ global: { 'log-level': 'info' } }))
    })
    const { result } = await mountSeeded()

    await act(async () => {
      await result.current.handleDryRunValidate()
    })
    // The result must NOT ride the 4.5s auto-dismiss strip.
    expect(result.current.statusMsg).toBeNull()
    expect(result.current.dryRunResult).toEqual({
      outcome: 'valid-with-warnings',
      warnings: ['idle mode: no data source', 'idle mode: no transport'],
    })

    // Editing the YAML clears the (now stale) validation result.
    act(() => {
      result.current.setYamlContent(`${SERVER_YAML}# touched\n`)
    })
    expect(result.current.dryRunResult).toBeNull()
  })

  it('a clean success still uses the auto-dismiss status strip', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = route(input)
      if (url.includes('/configs/raw')) {
        return Promise.resolve(
          new Response(SERVER_YAML, {
            status: 200,
            headers: { 'content-type': 'application/yaml' },
          }),
        )
      }
      if (url.includes('/configs/validate')) {
        return Promise.resolve(jsonResponse({ valid: true, warnings: [] }))
      }
      return Promise.resolve(jsonResponse({ global: { 'log-level': 'info' } }))
    })
    const { result } = await mountSeeded()

    await act(async () => {
      await result.current.handleDryRunValidate()
    })
    expect(result.current.statusMsg?.type).toBe('success')
    expect(result.current.dryRunResult).toBeNull()
  })

  it('a server rejection lands in the persistent result block', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = route(input)
      if (url.includes('/configs/raw')) {
        return Promise.resolve(
          new Response(SERVER_YAML, {
            status: 200,
            headers: { 'content-type': 'application/yaml' },
          }),
        )
      }
      if (url.includes('/configs/validate')) {
        return Promise.resolve(jsonResponse({ valid: false, error: 'bad config: no rules' }))
      }
      return Promise.resolve(jsonResponse({ global: { 'log-level': 'info' } }))
    })
    const { result } = await mountSeeded()

    await act(async () => {
      await result.current.handleDryRunValidate()
    })
    expect(result.current.dryRunResult).toEqual({
      outcome: 'invalid',
      error: 'bad config: no rules',
    })
    expect(result.current.statusMsg).toBeNull()
  })
})

describe('useConfigCenter — log-level patch does not clobber the editor', () => {
  // Stateful mock: the overview reflects whatever level was last PATCHed,
  // like the real backend would after a successful PATCH /configs.
  function mockPatchAwareRaw(fetchRawImpl: () => Response) {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = route(input)
      const method = init?.method ?? 'GET'
      if (url.includes('/configs/raw')) {
        return Promise.resolve(fetchRawImpl())
      }
      if (url.includes('/configs') && method === 'PATCH') {
        patchLevel = String(JSON.parse(String(init?.body ?? '{}'))['log-level'] ?? 'info')
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      return Promise.resolve(jsonResponse({ global: { 'log-level': patchLevel } }))
    })
  }
  let patchLevel = 'info'

  it('PATCH updates the store baseline and leaves yamlContent untouched', async () => {
    patchLevel = 'info'
    mockPatchAwareRaw(
      () =>
        new Response(SERVER_YAML, { status: 200, headers: { 'content-type': 'application/yaml' } }),
    )
    const { result } = await mountSeeded()
    // Let the overview query settle so its (stale) response cannot race the
    // optimistic log-level update below.
    await waitFor(() => expect(result.current.configData).toBeTruthy())
    // Operator has unsaved editor work…
    const editedYaml = `${SERVER_YAML}# my local draft\n`
    act(() => {
      result.current.setYamlContent(editedYaml)
    })

    await act(async () => {
      await result.current.handleLogLevelChange('debug')
    })

    expect(result.current.currentLogLevel).toBe('debug')
    // …the editor content survives the PATCH…
    expect(result.current.yamlContent).toBe(editedYaml)
    // …and the store baseline reflects the live server value.
    const s = useConfigStore.getState()
    expect(s.savedConfig?.global?.['log-level']).toBe('debug')
    expect(s.workingConfig?.global?.['log-level']).toBe('debug')
    expect(s.dirty).toBe(false)
  })

  it('PATCH keeps a pending form-side log-level edit visible', async () => {
    patchLevel = 'info'
    mockPatchAwareRaw(
      () =>
        new Response(SERVER_YAML, { status: 200, headers: { 'content-type': 'application/yaml' } }),
    )
    const { result } = await mountSeeded()
    await waitFor(() => expect(result.current.configData).toBeTruthy())
    // User has an unapplied log-level edit on the form side…
    act(() => {
      useConfigStore.getState().updateGlobalField('log-level', 'warn')
    })

    await act(async () => {
      await result.current.handleLogLevelChange('debug')
    })
    const s = useConfigStore.getState()
    expect(s.savedConfig?.global?.['log-level']).toBe('debug')
    expect(s.workingConfig?.global?.['log-level']).toBe('warn')
    expect(s.dirty).toBe(true)
  })
})

describe('useConfigCenter — template/file load confirmation', () => {
  // The editor-dirty check compares the DEBOUNCED editor content; wait for
  // the debounce to flush after the auto-load before asserting the gate.
  async function settleDebounce() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350))
    })
  }

  it('a template load with pending edits waits for the discard confirmation', async () => {
    const { result } = await mountSeeded()
    await settleDebounce()
    act(() => {
      useConfigStore.getState().updateGlobalField('engine.workers', 8)
    })

    const template = CONFIG_TEMPLATES[0]!
    act(() => {
      result.current.handleLoadTemplate(template)
    })
    // Confirm dialog open; nothing replaced yet.
    expect(result.current.loadConfirmOpen).toBe(true)
    expect(result.current.yamlContent).toBe(SERVER_YAML)

    act(() => {
      result.current.confirmPendingLoad()
    })
    expect(result.current.loadConfirmOpen).toBe(false)
    // Template yaml (with a regenerated secret) replaced the editor.
    expect(result.current.yamlContent).not.toBe(SERVER_YAML)
    expect(result.current.yamlContent).toContain('node-01')
  })

  it('a template load without pending edits applies directly', async () => {
    const { result } = await mountSeeded()
    await settleDebounce()
    const template = CONFIG_TEMPLATES[0]!
    act(() => {
      result.current.handleLoadTemplate(template)
    })
    expect(result.current.loadConfirmOpen).toBe(false)
    expect(result.current.yamlContent).not.toBe(SERVER_YAML)
  })

  it('cancel leaves pending edits and the editor untouched', async () => {
    const { result } = await mountSeeded()
    await settleDebounce()
    act(() => {
      useConfigStore.getState().updateGlobalField('engine.workers', 8)
    })
    act(() => {
      result.current.handleLoadTemplate(CONFIG_TEMPLATES[0]!)
    })
    act(() => {
      result.current.cancelPendingLoad()
    })
    expect(result.current.loadConfirmOpen).toBe(false)
    expect(result.current.yamlContent).toBe(SERVER_YAML)
    expect(useConfigStore.getState().workingConfig?.global?.engine?.workers).toBe(8)
  })
})

describe('useConfigCenter — diff baseline is the saved server config', () => {
  it('diffBaselineYaml follows the saved baseline, not a per-session variable', async () => {
    const { result } = await mountSeeded()
    expect(result.current.diffBaselineYaml).toBeTruthy()
    expect(result.current.diffBaselineYaml).toContain('d1')

    // Edit the editor → diff computed against the server baseline.
    act(() => {
      result.current.setYamlContent(`${YAML_WITH_OTHER_EDIT}# extra line\n`)
    })
    await waitFor(() => expect(result.current.hasDiffChanges).toBe(true))
    expect(result.current.diffLines.some((l) => l.type === 'added')).toBe(true)
  })
})

describe('useConfigCenter — server validate gates the YAML apply', () => {
  it('a server dry-run rejection blocks the PUT with the server message', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = route(input)
      const method = init?.method ?? 'GET'
      if (url.includes('/configs/raw')) {
        return Promise.resolve(
          new Response(SERVER_YAML, {
            status: 200,
            headers: { 'content-type': 'application/yaml' },
          }),
        )
      }
      if (url.includes('/configs/validate')) {
        return Promise.resolve(
          jsonResponse({ valid: false, error: 'config validation failed: no transports' }),
        )
      }
      if (url.includes('/configs') && method === 'PUT') {
        ;(fetchMock as unknown as { putCalls: string[] }).putCalls.push(String(init?.body ?? ''))
        return Promise.resolve(new Response('', { status: 200 }))
      }
      return Promise.resolve(jsonResponse({}))
    })
    const { result } = await mountSeeded()
    act(() => {
      result.current.setYamlContent(YAML_WITH_OTHER_EDIT)
    })

    await act(async () => {
      await result.current.handleYamlApplyConfirm()
    })
    expect(putPayloads()).toHaveLength(0)
    expect(result.current.yamlApplyError).toContain('no transports')
    // The editor edits stay pending — nothing was applied.
    expect(useConfigStore.getState().dirty).toBe(false)
  })

  it('server warnings surface on the apply dialog and the PUT proceeds', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = route(input)
      const method = init?.method ?? 'GET'
      if (url.includes('/configs/raw')) {
        return Promise.resolve(
          new Response(SERVER_YAML, {
            status: 200,
            headers: { 'content-type': 'application/yaml' },
          }),
        )
      }
      if (url.includes('/configs/validate')) {
        return Promise.resolve(jsonResponse({ valid: true, warnings: ['idle mode: no transport'] }))
      }
      if (url.includes('/configs') && method === 'PUT') {
        ;(fetchMock as unknown as { putCalls: string[] }).putCalls.push(String(init?.body ?? ''))
        return Promise.resolve(new Response('', { status: 200 }))
      }
      return Promise.resolve(jsonResponse({}))
    })
    const { result } = await mountSeeded()
    act(() => {
      result.current.setYamlContent(YAML_WITH_OTHER_EDIT)
    })

    await act(async () => {
      await result.current.handleYamlApplyConfirm()
    })
    expect(putPayloads()).toHaveLength(1)
    expect(result.current.yamlApplyWarnings).toContain('idle mode: no transport')
  })
})
