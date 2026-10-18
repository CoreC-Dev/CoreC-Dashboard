// @vitest-environment jsdom
// C-A5 regression: a failing step gate must say WHICH required fields are
// still empty — "Missing required: Host" — instead of the generic
// "Please fix the errors before continuing".
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DriverWizard } from '@/features/admin/DriverWizard'
import { TransportWizard } from '@/features/admin/TransportWizard'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'

vi.setConfig({ testTimeout: 15_000 })

beforeAll(async () => {
  await i18n.changeLanguage('en')
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  useConfigStore.getState().reset()
})

function renderWizard(el: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={qc}>{el}</QueryClientProvider>)
}

describe('wizard gate reasons (C-A5)', () => {
  it('DriverWizard connection step: empty name + settings list the exact missing fields', async () => {
    renderWizard(<DriverWizard open onOpenChange={vi.fn()} />)

    expect(await screen.findByText('Create Driver')).toBeTruthy()

    // Step 0: pick a type, advance to the connection step.
    await act(async () => {
      fireEvent.click(screen.getByText('Modbus TCP'))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    })

    // Clear the name (create mode starts empty) and empty the first
    // registry field (host) — the wizard pre-fills registry defaults, so
    // wipe it to force a missing-required state. Selected positionally:
    // the registry placeholders are owned by lib/settingsRegistry* and in
    // sibling-churn, so exact placeholder strings are fragile here.
    const textboxes = screen.getAllByRole('textbox')
    const nameInput = textboxes[0]!
    const hostInput = textboxes[1]!
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: '' } })
    })
    await act(async () => {
      fireEvent.change(hostInput, { target: { value: '' } })
    })

    // The gate hint names the missing fields, not a generic nag.
    const hint = await screen.findByText(/Missing required:/)
    expect(hint.textContent).toMatch(/Driver Name/)
    expect(hint.textContent).toMatch(/Host/)
    // The generic hint is gone.
    expect(screen.queryByText('Please fix the errors before continuing')).toBeNull()

    // Filling both fields clears the hint and re-enables Next.
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'plc-new' } })
    })
    await act(async () => {
      fireEvent.change(hostInput, { target: { value: '10.0.0.5' } })
    })
    await waitForHintGone()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('DriverWizard connection step: a duplicate name gets the nameExists reason', async () => {
    useConfigStore
      .getState()
      .seedFromServer(
        [
          'drivers:',
          '  - name: plc1',
          '    type: modbus-tcp',
          '    settings:',
          '      host: 10.0.0.1',
          '    tags: []',
        ].join('\n'),
      )
    renderWizard(<DriverWizard open onOpenChange={vi.fn()} />)

    expect(await screen.findByText('Create Driver')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByText('Modbus TCP'))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    })
    await act(async () => {
      fireEvent.change(screen.getAllByRole('textbox')[0]!, {
        target: { value: 'plc1' },
      })
    })

    const matches = await screen.findAllByText('A driver with this name already exists.')
    // Both the inline field error and the footer gate hint carry it.
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('DriverWizard tags step: the gate names the tag requirement', async () => {
    renderWizard(<DriverWizard open onOpenChange={vi.fn()} />)
    expect(await screen.findByText('Create Driver')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByText('Modbus TCP'))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    })
    await act(async () => {
      fireEvent.change(screen.getAllByRole('textbox')[0]!, {
        target: { value: 'plc-new' },
      })
    })
    // Fill the required host field too, or the connection gate blocks Next.
    await act(async () => {
      fireEvent.change(screen.getAllByRole('textbox')[1]!, {
        target: { value: '10.0.0.5' },
      })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    })

    // On the empty tags step the requirement is stated concretely —
    // both inline in the tag editor and in the footer gate hint.
    expect(
      (await screen.findAllByText('At least one tag is required')).length,
    ).toBeGreaterThanOrEqual(2)
  })

  it('TransportWizard connection step: lists the transport name and broker', async () => {
    renderWizard(<TransportWizard open onOpenChange={vi.fn()} />)

    expect(await screen.findByText('Create Transport')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByText('MQTT'))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    })
    // Empty the broker (registry default is pre-filled) — positional
    // selector, same rationale as the driver test above.
    await act(async () => {
      fireEvent.change(screen.getAllByRole('textbox')[1]!, {
        target: { value: '' },
      })
    })

    const hint = await screen.findByText(/Missing required:/)
    expect(hint.textContent).toMatch(/Transport Name/)
    expect(hint.textContent).toMatch(/Broker URL/)
  })
})

async function waitForHintGone() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}
