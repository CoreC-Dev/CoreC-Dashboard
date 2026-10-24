// @vitest-environment jsdom
// Regression: the admin wizards (driver / transport / rule) must guard
// every dismiss path (Cancel button, X, Esc) behind the shared
// DiscardChangesDialog when the draft has unsaved input — and close
// immediately (no nag) when nothing was touched.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DriverWizard } from '@/features/admin/DriverWizard'
import { RuleWizard } from '@/features/admin/RuleWizard'
import { TransportWizard } from '@/features/admin/TransportWizard'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'
import type { DriverConfig, RuleConfig, TransportConfig } from '@/types/config'

// The wizards render heavy step grids (registry fields, connection-test
// card); under full-suite load on a 2-core box they can exceed the 5s
// default. 15s mirrors the BatchWritePanel suite-timeout precedent.
vi.setConfig({ testTimeout: 15_000 })

const EXISTING_DRIVER: DriverConfig = {
  name: 'plc1',
  type: 'modbus-tcp',
  settings: { host: '192.168.1.100', port: 502 },
  tags: [{ name: 'temp', address: '40001', type: 'float32' }],
}

const EXISTING_TRANSPORT: TransportConfig = {
  name: 'mqtt-out',
  type: 'mqtt',
  settings: { broker: 'tcp://broker:1883' },
}

const EXISTING_RULE: RuleConfig = {
  name: 'forward-all',
  match: 'ALL',
  action: 'forward',
  priority: 100,
  target: 'mqtt-out',
}

function renderWizard(el: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={qc}>{el}</QueryClientProvider>)
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
  useConfigStore.getState().reset()
  // jsdom lacks ResizeObserver, which the wizard's sliding step indicator
  // instantiates when the active step changes (same treatment as the
  // scrollIntoView stub in BatchWritePanel.test).
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

// vitest runs without globals:true — @testing-library/react's auto-cleanup
// never registers; clean the DOM explicitly between tests.
afterEach(() => {
  cleanup()
  useConfigStore.getState().reset()
})

describe('wizard cancel guard', () => {
  it('DriverWizard create: untouched draft cancels immediately — no dialog', async () => {
    const onOpenChange = vi.fn()
    renderWizard(<DriverWizard open onOpenChange={onOpenChange} />)

    expect(await screen.findByText('Create Driver')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull()
  })

  it('DriverWizard edit: a changed field asks for discard confirmation before closing', async () => {
    const onOpenChange = vi.fn()
    renderWizard(<DriverWizard open onOpenChange={onOpenChange} existingDriver={EXISTING_DRIVER} />)

    expect(await screen.findByText('Edit Driver')).toBeTruthy()

    // Advance to the connection step and change the host field.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    })
    const hostInput = screen.getByPlaceholderText(/192\.168\./)
    await act(async () => {
      fireEvent.change(hostInput, { target: { value: '10.0.0.5' } })
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })

    // The discard confirmation appears; the wizard is NOT closed yet.
    expect(await screen.findByText('Discard unsaved changes?')).toBeTruthy()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByText('Edit Driver')).toBeTruthy()

    // Explicit "Discard" closes the wizard.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('RuleWizard edit: the X close button also respects the guard, and dismissing it keeps the wizard', async () => {
    const onOpenChange = vi.fn()
    renderWizard(<RuleWizard open onOpenChange={onOpenChange} existingRule={EXISTING_RULE} />)

    expect(await screen.findByText('Edit Rule')).toBeTruthy()

    // Type into the match expression (textarea) — the draft is now dirty.
    const matchArea = screen.getByPlaceholderText('driver == "plc-modbus" && value > 50')
    await act(async () => {
      fireEvent.change(matchArea, { target: { value: 'value > 50' } })
    })

    // The X (DialogPrimitive.Close) is a guarded close path too.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    })
    expect(await screen.findByText('Discard unsaved changes?')).toBeTruthy()
    expect(onOpenChange).not.toHaveBeenCalled()

    // Cancelling the discard dialog keeps the wizard (and the draft) open.
    const cancels = screen.getAllByRole('button', { name: 'Cancel' })
    await act(async () => {
      fireEvent.click(cancels[cancels.length - 1])
    })
    await waitFor(() => expect(screen.queryByText('Discard unsaved changes?')).toBeNull())
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByText('Edit Rule')).toBeTruthy()

    // Second X + explicit Discard closes it.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('RuleWizard create: Esc on a dirty draft opens the discard confirmation', async () => {
    const onOpenChange = vi.fn()
    renderWizard(<RuleWizard open onOpenChange={onOpenChange} />)

    expect(await screen.findByText('Create Rule')).toBeTruthy()

    const nameInput = screen.getByPlaceholderText('forward-to-cloud')
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'my-rule' } })
    })

    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Escape' })
    })

    expect(await screen.findByText('Discard unsaved changes?')).toBeTruthy()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByText('Create Rule')).toBeTruthy()
  })

  it('TransportWizard edit: untouched pre-filled draft closes without nagging', async () => {
    const onOpenChange = vi.fn()
    renderWizard(
      <TransportWizard open onOpenChange={onOpenChange} existingTransport={EXISTING_TRANSPORT} />,
    )

    expect(await screen.findByText('Edit Transport')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull()
  })
})
