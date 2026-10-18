// @vitest-environment jsdom
// A-01 — the card must render the recorded probe-failure kind as translated
// copy, keeping "invalid API key" visually distinct from "cannot reach
// server" (red dot + distinct message in both cases).
import { cleanup, configure, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { InstanceCard } from '@/features/home/InstanceCard'
import i18n from '@/i18n'
import { useInstanceStore } from '@/stores/instanceStore'
import type { CoreCInstance } from '@/types/models'

// Load-tolerant async-assertion timeout: the runner is shared with parallel
// agents on a 2-core host, and RTL waitFor's 1s default flakes under contention.
configure({ asyncUtilTimeout: 4000 })

const t = (key: string) => i18n.t(key)

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
