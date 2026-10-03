// @vitest-environment jsdom
// TD-TEST-005 — ConnectionProvider probe lifecycle: success, error,
// instance-not-found, unmount cleanup (AbortError), and reconnect().
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveConnection } from '@/api/activeConnection'
import { getServerInfo } from '@/api/endpoints'
import { ConnectionProvider, useConnection } from '@/contexts/ConnectionContext'
import { useConfigStore } from '@/stores/configStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { useInstanceStore } from '@/stores/instanceStore'
import type { ServerInfoResponse } from '@/types/api'
import type { CoreCInstance } from '@/types/models'

// Mock the API layer — the provider only calls getServerInfo to probe.
vi.mock('@/api/endpoints', () => ({
  getServerInfo: vi.fn(),
}))

// Mock the active-connection singleton so no module-level state leaks.
vi.mock('@/api/activeConnection', () => ({
  setActiveConnection: vi.fn(),
  getActiveConnection: vi.fn().mockReturnValue(null),
}))

const instance: CoreCInstance = {
  id: 'inst-1',
  name: 'Test Instance',
  baseUrl: 'http://test.local',
  secret: 'secret-1',
  createdAt: '2024-01-01T00:00:00Z',
  sortOrder: 1,
}

const serverInfo = (name: string, version = '1'): ServerInfoResponse => ({
  name,
  version,
  status: 'ok',
  time: '0',
  uptime: '0s',
})

/** Child that surfaces the connection context value to the DOM. */
function ConnectionConsumer() {
  const ctx = useConnection()
  return (
    <div>
      <span data-testid="isConnected">{String(ctx.isConnected)}</span>
      <span data-testid="isConnecting">{String(ctx.isConnecting)}</span>
      <span data-testid="error">{ctx.error ?? ''}</span>
      <span data-testid="serverInfoName">{ctx.serverInfo?.name ?? ''}</span>
      <button type="button" data-testid="reconnect" onClick={ctx.reconnect}>
        reconnect
      </button>
    </div>
  )
}

const isConnected = () => screen.getByTestId('isConnected').textContent
const isConnecting = () => screen.getByTestId('isConnecting').textContent
const errorText = () => screen.getByTestId('error').textContent
const serverInfoName = () => screen.getByTestId('serverInfoName').textContent

function setInstances(instances: CoreCInstance[]): void {
  useInstanceStore.setState({ instances, probing: {}, probeErrors: {} })
}

beforeEach(() => {
  setInstances([])
  useConnectionStore.setState({ isConnected: false })
  useConfigStore.getState().reset()
  vi.mocked(getServerInfo).mockReset()
  vi.mocked(setActiveConnection).mockClear()
})

// vitest runs without globals:true, so @testing-library/react's auto-cleanup
// (which probes for a global afterEach) never registers. Unmount explicitly
// between tests so providers don't leak into the shared instance store.
afterEach(() => {
  cleanup()
})

describe('ConnectionProvider (TD-TEST-005)', () => {
  it('successful probe sets isConnected true and clears error', async () => {
    setInstances([instance])
    vi.mocked(getServerInfo).mockResolvedValue(serverInfo('test', 'dev'))

    render(
      <ConnectionProvider instanceId="inst-1">
        <ConnectionConsumer />
      </ConnectionProvider>,
    )

    await waitFor(() => {
      expect(isConnected()).toBe('true')
    })
    expect(isConnecting()).toBe('false')
    expect(errorText()).toBe('')
    expect(serverInfoName()).toBe('test')
  })

  it('rejected probe sets the error message', async () => {
    setInstances([instance])
    vi.mocked(getServerInfo).mockRejectedValue(new Error('Network error'))

    render(
      <ConnectionProvider instanceId="inst-1">
        <ConnectionConsumer />
      </ConnectionProvider>,
    )

    await waitFor(() => {
      expect(errorText()).toBe('Network error')
    })
    expect(isConnected()).toBe('false')
    expect(isConnecting()).toBe('false')
  })

  it('missing instance sets "Instance not found" error', async () => {
    setInstances([])

    render(
      <ConnectionProvider instanceId="inst-1">
        <ConnectionConsumer />
      </ConnectionProvider>,
    )

    await waitFor(() => {
      expect(errorText()).toBe('Instance not found')
    })
    expect(isConnected()).toBe('false')
    expect(isConnecting()).toBe('false')
    expect(vi.mocked(getServerInfo)).not.toHaveBeenCalled()
  })

  it('unmount aborts the in-flight probe and clears probing state', async () => {
    setInstances([instance])
    let resolveProbe!: (v: ServerInfoResponse) => void
    vi.mocked(getServerInfo).mockReturnValue(
      new Promise<ServerInfoResponse>((resolve) => {
        resolveProbe = resolve
      }),
    )

    const result = render(
      <ConnectionProvider instanceId="inst-1">
        <ConnectionConsumer />
      </ConnectionProvider>,
    )

    // Probe is in flight → the provider flagged the instance as probing.
    await waitFor(() => {
      expect(useInstanceStore.getState().probing['inst-1']).toBe(true)
    })

    result.unmount()

    // Cleanup (AbortController.abort + setProbing(false)) ran on unmount.
    expect(useInstanceStore.getState().probing['inst-1']).toBe(false)

    // A late resolution must not mutate state — the cancelled guard holds.
    resolveProbe(serverInfo('late'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(useInstanceStore.getState().instances[0]?.lastKnownInfo).toBeUndefined()
  })

  it('reconnect() triggers a new probe', async () => {
    setInstances([instance])
    vi.mocked(getServerInfo).mockResolvedValueOnce(serverInfo('first', '1'))
    vi.mocked(getServerInfo).mockResolvedValue(serverInfo('second', '2'))

    render(
      <ConnectionProvider instanceId="inst-1">
        <ConnectionConsumer />
      </ConnectionProvider>,
    )

    await waitFor(() => {
      expect(serverInfoName()).toBe('first')
    })
    expect(vi.mocked(getServerInfo)).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('reconnect'))

    await waitFor(() => {
      expect(serverInfoName()).toBe('second')
    })
    expect(vi.mocked(getServerInfo)).toHaveBeenCalledTimes(2)
  })
})
