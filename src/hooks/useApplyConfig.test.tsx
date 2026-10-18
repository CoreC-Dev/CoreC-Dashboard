// @vitest-environment jsdom
/**
 * useApplyConfig — D-16 guard coverage.
 *
 * The shared form-mode apply flow (Drivers/Transports/Rules/Config pages)
 * must refuse to PUT /configs while the server config has never been
 * loaded (auto-seed in flight or failed, no saved baseline). Applying an
 * unknown working config then could wipe the running control plane.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useApplyConfig } from '@/hooks/useApplyConfig'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'

vi.mock('@/api/activeConnection', () => ({
  getActiveConnection: () => ({
    instanceId: 'test-instance',
    baseUrl: 'http://test',
    secret: 'test-secret',
  }),
  setActiveConnection: vi.fn(),
}))

const fetchMock = vi.fn()

beforeAll(() => {
  vi.stubGlobal('fetch', fetchMock)
  void i18n.changeLanguage('en')
})

beforeEach(() => {
  useConfigStore.setState({
    workingConfig: null,
    savedConfig: null,
    dirty: false,
    error: null,
    seedStatus: 'idle',
    seedError: null,
  })
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  putCalls.length = 0
})

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return Wrapper
}

const putCalls: string[] = []

function mountApplyConfig() {
  const rendered = renderHook(
    () =>
      useApplyConfig({
        getWorkingYaml: () => useConfigStore.getState().getWorkingYaml(),
        getSavedYaml: () => useConfigStore.getState().getSavedYaml(),
        markSaved: () => useConfigStore.getState().markSaved(),
        validationErrors: undefined,
      }),
    { wrapper: createWrapper() },
  )
  return rendered
}

describe('useApplyConfig — D-16 guard', () => {
  it('refuses to PUT while the server config failed to load', async () => {
    // Simulate a working config the user built without any server baseline
    // (e.g. seed failed and they clicked Create before the guard existed).
    useConfigStore.setState({
      workingConfig: { global: { 'log-level': 'info' } },
      dirty: true,
      seedStatus: 'failed',
      seedError: 'backend restarting',
    })
    fetchMock.mockImplementation((_input: unknown, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PUT') {
        putCalls.push(String(init?.body ?? ''))
        return Promise.resolve(new Response('', { status: 200 }))
      }
      return Promise.resolve(
        new Response('{}', { headers: { 'content-type': 'application/json' } }),
      )
    })

    const { result } = mountApplyConfig()
    act(() => {
      result.current.dialogProps.onConfirm()
    })

    expect(putCalls).toHaveLength(0)
    expect(result.current.dialogProps.applyError).toBeTruthy()
    // The store was NOT marked saved — nothing was sent.
    expect(useConfigStore.getState().dirty).toBe(true)
  })

  it('applies normally once a baseline exists', async () => {
    const yaml = 'global:\n  log-level: debug\n'
    useConfigStore.setState({
      workingConfig: { global: { 'log-level': 'debug' } },
      savedConfig: { global: { 'log-level': 'info' } },
      dirty: true,
      seedStatus: 'ready',
    })
    fetchMock.mockImplementation((_input: unknown, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PUT') {
        putCalls.push(String(init?.body ?? ''))
        return Promise.resolve(new Response('', { status: 200 }))
      }
      return Promise.resolve(
        new Response('{}', { headers: { 'content-type': 'application/json' } }),
      )
    })

    const { result } = mountApplyConfig()
    act(() => {
      result.current.dialogProps.onConfirm()
    })
    await vi.waitFor(() => expect(putCalls).toHaveLength(1))
    expect(result.current.open).toBe(false)
    expect(useConfigStore.getState().dirty).toBe(false)
  })
})
