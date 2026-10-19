// @vitest-environment jsdom
// A-01 — the card must render the recorded probe-failure kind as translated
// copy, keeping "invalid API key" visually distinct from "cannot reach
// server" (red dot + distinct message in both cases).
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstanceCard } from '@/features/home/InstanceCard'
import i18n from '@/i18n'
import { useInstanceStore } from '@/stores/instanceStore'
import type { CoreCInstance } from '@/types/models'

// Load-tolerant async-assertion timeout: the runner is shared with parallel
// agents on a 2-core host, and RTL waitFor's 1s default flakes under contention.
configure({ asyncUtilTimeout: 4000 })

const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts)

// Mock fetch — needed by the A-08 retry test (probeOneInstance hits the
// five probe endpoints). Healthy by default.
const mockFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function mockHealthyEndpoints() {
  mockFetch.mockImplementation((url: string) => {
    switch (url) {
      case '/corec-proxy/':
        return Promise.resolve(
          jsonRes({ name: 'edge-node', version: '1.2.3', status: 'running', uptime: '1h' }),
        )
      case '/corec-proxy/stats':
        return Promise.resolve(jsonRes({ drivers: 1 }))
      case '/corec-proxy/tags':
        return Promise.resolve(jsonRes({ tags: { a: 1 } }))
      case '/corec-proxy/rules':
        return Promise.resolve(jsonRes({ rules: [] }))
      case '/corec-proxy/configs/raw':
        return Promise.resolve(new Response('', { status: 200 }))
      default:
        return Promise.resolve(new Response('not found', { status: 404 }))
    }
  })
}

const baseInstance: CoreCInstance = {
  id: 'inst-1',
  name: 'Gateway A',
  baseUrl: 'http://127.0.0.1:9090',
  secret: 'secret-token',
  createdAt: '2026-01-01T00:00:00.000Z',
  sortOrder: 1,
}

function renderCard(instance: CoreCInstance) {
  return render(
    <MemoryRouter>
      <InstanceCard instance={instance} onEdit={() => {}} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockFetch.mockReset()
  mockHealthyEndpoints()
  useInstanceStore.setState({ instances: [baseInstance], probing: {}, probeErrors: {} })
})

afterEach(cleanup)

describe('InstanceCard probe-error rendering (A-01)', () => {
  it("renders the invalid-key copy for the 'unauthorized' kind with an error dot", () => {
    useInstanceStore.setState({ probeErrors: { 'inst-1': 'unauthorized' } })

    const { container } = renderCard(baseInstance)

    expect(screen.getByText(t('instances.probeUnauthorized'))).toBeInTheDocument()
    expect(screen.queryByText(t('instances.probeUnreachable'))).not.toBeInTheDocument()
    // Error state → red status dot.
    expect(container.querySelector('.bg-status-error')).not.toBeNull()
  })

  it("renders the unreachable copy for the 'unreachable' kind", () => {
    useInstanceStore.setState({ probeErrors: { 'inst-1': 'unreachable' } })

    const { container } = renderCard(baseInstance)

    expect(screen.getByText(t('instances.probeUnreachable'))).toBeInTheDocument()
    expect(screen.queryByText(t('instances.probeUnauthorized'))).not.toBeInTheDocument()
    expect(container.querySelector('.bg-status-error')).not.toBeNull()
  })

  it("renders the timeout copy for the 'timeout' kind", () => {
    useInstanceStore.setState({ probeErrors: { 'inst-1': 'timeout' } })

    renderCard(baseInstance)

    expect(screen.getByText(t('instances.probeTimeout'))).toBeInTheDocument()
  })

  it('renders no error copy when the last probe succeeded', () => {
    useInstanceStore.setState({ probeErrors: { 'inst-1': null } })

    const { container } = renderCard(baseInstance)

    expect(screen.queryByText(t('instances.probeUnauthorized'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('instances.probeUnreachable'))).not.toBeInTheDocument()
    expect(container.querySelector('.bg-status-error')).toBeNull()
  })
})

// A-07 — the 15s background re-probe used to flip EVERY card to a yellow
// "connecting" dot (dead instances alternated yellow/red forever). A probe
// in flight must not disturb a card that already has a verdict; the yellow
// radar state is reserved for the very first probe.
describe('InstanceCard background re-probe stability (A-07)', () => {
  it('keeps the green dot while re-probing an already-connected instance', () => {
    useInstanceStore.setState({
      instances: [{ ...baseInstance, lastConnectedAt: '2026-01-01T00:00:00.000Z' }],
      probeErrors: { 'inst-1': null },
      probing: { 'inst-1': true },
    })

    const { container } = renderCard({
      ...baseInstance,
      lastConnectedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(container.querySelector('.bg-status-running')).not.toBeNull()
    expect(container.querySelector('.bg-status-warning')).toBeNull()
    expect(container.querySelector('.radar-ping')).toBeNull()
  })

  it('keeps the red dot while re-probing a failed instance', () => {
    useInstanceStore.setState({
      probeErrors: { 'inst-1': 'unauthorized' },
      probing: { 'inst-1': true },
    })

    const { container } = renderCard(baseInstance)

    expect(container.querySelector('.bg-status-error')).not.toBeNull()
    expect(container.querySelector('.bg-status-warning')).toBeNull()
    expect(container.querySelector('.radar-ping')).toBeNull()
  })

  it('still shows the yellow connecting dot + radar for a first probe', () => {
    useInstanceStore.setState({ probing: { 'inst-1': true } })

    const { container } = renderCard(baseInstance)

    expect(container.querySelector('.bg-status-warning')).not.toBeNull()
    expect(container.querySelector('.radar-ping')).not.toBeNull()
  })
})

// A-08/D-12 — the refresh icon on a failed card used to NAVIGATE INTO the
// instance (the opposite of retrying) and had no accessible label at all.
// It must now re-probe, announce itself as "retry connection", and spin
// while the re-probe is in flight.
describe('InstanceCard error-state retry (A-08/D-12)', { timeout: 15_000 }, () => {
  it('retries the probe from a failed card and records the fresh verdict', async () => {
    useInstanceStore.setState({ probeErrors: { 'inst-1': 'unreachable' } })
    const { container } = renderCard(baseInstance)
    expect(container.querySelector('.bg-status-error')).not.toBeNull()

    const retry = screen.getByRole('button', { name: t('instances.retryConnection') })
    // Accessible name + hover hint both present (D-12: it had neither).
    expect(retry).toHaveAttribute('title', t('instances.retryConnection'))
    expect(retry).not.toHaveAttribute('aria-label', 'common.refresh')

    fireEvent.click(retry)

    // The retry re-probes (five endpoint requests) instead of navigating…
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })
    // …and the fresh verdict lands in the store: error cleared, connection
    // stamped, version recorded.
    await waitFor(() => {
      expect(useInstanceStore.getState().probeErrors['inst-1']).toBeNull()
    })
    expect(useInstanceStore.getState().instances[0]?.lastKnownInfo?.version).toBe('1.2.3')
    expect(useInstanceStore.getState().instances[0]?.lastConnectedAt).toBeTruthy()
    // With the error cleared, the card leaves the error state — the retry
    // affordance (only rendered for status==='error') is gone.
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: t('instances.retryConnection') }),
      ).not.toBeInTheDocument()
    })
  })

  it('shows no retry button when the card is healthy', () => {
    useInstanceStore.setState({
      instances: [{ ...baseInstance, lastConnectedAt: '2026-01-01T00:00:00.000Z' }],
      probeErrors: { 'inst-1': null },
    })
    renderCard({ ...baseInstance, lastConnectedAt: '2026-01-01T00:00:00.000Z' })
    expect(
      screen.queryByRole('button', { name: t('instances.retryConnection') }),
    ).not.toBeInTheDocument()
  })
})

// A-13 — the colored status dot carried no text, tooltip or aria-label:
// color-blind operators could not tell the states apart and screen readers
// announced nothing. The dot must label itself in every state, and the
// error/unknown states must also render the word as a badge next to it.
describe('InstanceCard status dot labeling (A-13)', () => {
  function statusDot(container: HTMLElement): HTMLElement {
    const dot = container.querySelector('span[role="img"]')
    expect(dot).not.toBeNull()
    return dot as HTMLElement
  }

  it('labels the error dot and renders the error word as a badge', () => {
    useInstanceStore.setState({ probeErrors: { 'inst-1': 'unauthorized' } })

    const { container } = renderCard(baseInstance)

    const dot = statusDot(container)
    expect(dot).toHaveAttribute('title', t('common.error'))
    expect(dot).toHaveAttribute('aria-label', t('common.error'))
    expect(screen.getByText(t('common.error'))).toBeInTheDocument()
  })

  it('labels the unknown dot and renders the unknown word as a badge', () => {
    const { container } = renderCard(baseInstance)

    const dot = statusDot(container)
    expect(dot).toHaveAttribute('title', t('common.unknown'))
    expect(dot).toHaveAttribute('aria-label', t('common.unknown'))
    expect(screen.getByText(t('common.unknown'))).toBeInTheDocument()
  })

  it('labels the connected dot via title only — no badge for healthy states', () => {
    useInstanceStore.setState({
      instances: [{ ...baseInstance, lastConnectedAt: '2026-01-01T00:00:00.000Z' }],
      probeErrors: { 'inst-1': null },
    })

    const { container } = renderCard({
      ...baseInstance,
      lastConnectedAt: '2026-01-01T00:00:00.000Z',
    })

    const dot = statusDot(container)
    expect(dot).toHaveAttribute('title', t('common.connected'))
    expect(dot).toHaveAttribute('aria-label', t('common.connected'))
    // Healthy and mid-probe states rely on the label alone (audit: a badge
    // on every card would be noise).
    expect(screen.queryByText(t('common.error'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('common.unknown'))).not.toBeInTheDocument()
  })

  it('labels the first-probe connecting dot', () => {
    useInstanceStore.setState({ probing: { 'inst-1': true } })

    const { container } = renderCard(baseInstance)

    const dot = statusDot(container)
    expect(dot).toHaveAttribute('title', t('common.connecting'))
    expect(dot).toHaveAttribute('aria-label', t('common.connecting'))
  })
})

// A-18 — the store has had reorderInstances since the first commit but no
// UI ever called it: an operator with several instances could not reorder
// them at all. The card menu now offers move up/down wired to that action.
describe('InstanceCard reorder menu (A-18)', { timeout: 15_000 }, () => {
  const secondInstance: CoreCInstance = {
    ...baseInstance,
    id: 'inst-2',
    name: 'Gateway B',
    sortOrder: 2,
  }

  async function openMenu(): Promise<void> {
    const trigger = screen.getByRole('button', { name: t('common.moreActions') })
    // Radix opens the menu on pointerdown, then registers the click.
    fireEvent.pointerDown(trigger)
    fireEvent.click(trigger)
    await waitFor(() => {
      expect(screen.getByText(t('instances.moveUp'))).toBeInTheDocument()
    })
  }

  function currentOrder(): string[] {
    return useInstanceStore.getState().instances.map((i) => i.id)
  }

  it('moves the first card down by swapping with its neighbor', async () => {
    useInstanceStore.setState({ instances: [baseInstance, secondInstance] })
    renderCard(baseInstance)

    await openMenu()
    fireEvent.click(screen.getByText(t('instances.moveDown')))

    // The neighbor moved up; sortOrder renumbered and persisted.
    expect(currentOrder()).toEqual(['inst-2', 'inst-1'])
  })

  it('moves the second card up', async () => {
    useInstanceStore.setState({ instances: [baseInstance, secondInstance] })
    renderCard(secondInstance)

    await openMenu()
    fireEvent.click(screen.getByText(t('instances.moveUp')))

    expect(currentOrder()).toEqual(['inst-2', 'inst-1'])
  })

  it('disables move-up on the first card and move-down on the last', async () => {
    useInstanceStore.setState({ instances: [baseInstance, secondInstance] })
    renderCard(baseInstance)

    await openMenu()
    const moveUp = screen.getByText(t('instances.moveUp')).closest('[role="menuitem"]')
    expect(moveUp).toHaveAttribute('aria-disabled', 'true')

    // The same two-item list, seen from the last card: move-down is dead.
    cleanup()
    renderCard(secondInstance)
    await openMenu()
    const moveDown = screen.getByText(t('instances.moveDown')).closest('[role="menuitem"]')
    expect(moveDown).toHaveAttribute('aria-disabled', 'true')
  })

  it('shows both move items regardless of the card state', async () => {
    // A healthy card must still offer reordering (the items are list-level,
    // not connection-level).
    useInstanceStore.setState({
      instances: [{ ...baseInstance, lastConnectedAt: '2026-01-01T00:00:00.000Z' }, secondInstance],
      probeErrors: { 'inst-1': null },
    })
    renderCard({ ...baseInstance, lastConnectedAt: '2026-01-01T00:00:00.000Z' })

    await openMenu()
    expect(screen.getByText(t('instances.moveUp'))).toBeInTheDocument()
    expect(screen.getByText(t('instances.moveDown'))).toBeInTheDocument()
    expect(screen.getByText(t('common.delete'))).toBeInTheDocument()
  })
})

// D-07 — deleting an instance is irreversible; it gets the same AlertDialog
// discipline as the other destructive actions: no dismissal on outside
// click, a destructive-styled confirm, and confirm copy that differs from
// the menu item that opened the dialog.
describe('InstanceCard delete confirmation (D-07)', { timeout: 15_000 }, () => {
  async function openDeleteDialog() {
    renderCard(baseInstance)
    const trigger = screen.getByRole('button', { name: t('common.moreActions') })
    // Radix opens the menu on pointerdown, then registers the click.
    fireEvent.pointerDown(trigger)
    fireEvent.click(trigger)
    const item = await waitFor(() => screen.getByText(t('common.delete')))
    fireEvent.click(item)
    // AlertDialog — NOT the old dismissible Dialog (role differs).
    return screen.findByRole('alertdialog')
  }

  it('asks for confirmation in an AlertDialog with a destructive, distinct action label', async () => {
    await openDeleteDialog()

    expect(
      screen.getByText(t('instances.deleteConfirm', { name: 'Gateway A' })),
    ).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: t('instances.deleteConfirmAction') })
    // The confirm label must differ from the menu item that opened it…
    expect(t('instances.deleteConfirmAction')).not.toBe(t('common.delete'))
    // …and carry the destructive styling shared by all irreversible actions.
    expect(confirm.className).toContain('bg-destructive')
  })

  it('deletes the instance only after the destructive confirm', async () => {
    await openDeleteDialog()

    fireEvent.click(screen.getByRole('button', { name: t('instances.deleteConfirmAction') }))
    await waitFor(() => {
      expect(useInstanceStore.getState().instances).toHaveLength(0)
    })
  })

  it('keeps the instance when cancelled', async () => {
    await openDeleteDialog()

    fireEvent.click(screen.getByRole('button', { name: t('common.cancel') }))
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(useInstanceStore.getState().instances).toHaveLength(1)
  })
})
