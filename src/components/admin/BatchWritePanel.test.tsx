// @vitest-environment jsdom
// Component test for the Write Control page's batch mode (BatchWritePanel).
// The endpoint layer is mocked (writeTag); the REAL useWriteTag mutation runs
// in a real QueryClient. i18n forced to English for deterministic assertions.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { BatchWritePanel } from '@/components/admin/BatchWritePanel'
import i18n from '@/i18n'

vi.mock('@/api/endpoints', () => ({
  writeTag: vi.fn(),
}))

import * as api from '@/api/endpoints'

// The Radix-Select-heavy tests open several portals and wait on multiple
// act() rounds; under full-suite load on a 2-core box they exceed the 5s
// default. 15s mirrors the InstanceDialog suite-timeout precedent
// (commit 1da217b, coverage-run flake).
vi.setConfig({ testTimeout: 15_000 })

const DRIVERS = [
  { name: 'plc1', type: 'modbus-tcp' },
  { name: 'plc2', type: 's7' },
]
const DRIVER_TAGS = new Map([['plc1', [{ name: 'temp', type: 'float32' }]]])

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <BatchWritePanel drivers={DRIVERS} driverTags={DRIVER_TAGS} />
    </QueryClientProvider>,
  )
}

/**
 * Picks a driver in a row's Radix Select via the KEYBOARD path (Enter to
 * open, Enter on the option to select) — jsdom has no Pointer Capture or
 * real pointerType on pointerdown, which the Radix trigger's mouse path
 * depends on. Combobox order per row: [driver, type] — row r's driver is
 * combobox index 2r.
 */
const pickDriver = async (row: number, name: string) => {
  const triggers = screen.getAllByRole('combobox')
  await act(async () => {
    fireEvent.keyDown(triggers[row * 2], { key: 'Enter' })
  })
  const option = await screen.findByRole('option', { name })
  await act(async () => {
    fireEvent.keyDown(option, { key: 'Enter' })
  })
}

/**
 * Picks a value in a row's TYPE Radix Select (keyboard path, same reason as
 * pickDriver). Type combobox of row r is index 2r+1.
 */
const pickType = async (row: number, name: string) => {
  const triggers = screen.getAllByRole('combobox')
  await act(async () => {
    fireEvent.keyDown(triggers[row * 2 + 1], { key: 'Enter' })
  })
  const option = await screen.findByRole('option', { name })
  await act(async () => {
    fireEvent.keyDown(option, { key: 'Enter' })
  })
}

/** Fills the free-text tag + value inputs of the given row. */
const fillRow = (row: number, tag: string, value: string) => {
  const tagInputs = screen
    .getAllByRole('textbox')
    .filter((el) => el.getAttribute('placeholder')?.includes('temperature_setpoint'))
  const valueInputs = screen
    .getAllByRole('textbox')
    .filter((el) => el.getAttribute('placeholder')?.includes('Numeric or string value'))
  fireEvent.change(tagInputs[row], { target: { value: tag } })
  fireEvent.change(valueInputs[row], { target: { value } })
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
  // jsdom lacks Element.scrollIntoView, which Radix Select calls to focus
  // the highlighted item inside the dropdown.
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  vi.clearAllMocks()
})

// vitest runs without globals:true — @testing-library/react's auto-cleanup
// never registers; clean the DOM explicitly between tests.
afterEach(() => {
  cleanup()
})

describe('BatchWritePanel', () => {
  it('renders one empty row and adds/removes rows', async () => {
    renderPanel()

    expect(screen.getByText('Batch Write Commands')).toBeTruthy()
    // One empty row: a single row-remove button, disabled (min 1 row).
    const removeButtons = screen.getAllByRole('button', { name: 'Remove row' })
    expect(removeButtons.length).toBe(1)
    expect(removeButtons[0]).toBeDisabled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Row' }))
    })
    expect(screen.getAllByRole('button', { name: 'Remove row' }).length).toBe(2)

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Remove row' })[1])
    })
    expect(screen.getAllByRole('button', { name: 'Remove row' }).length).toBe(1)
  })

  it('blocks submit with a per-row error when a row is incomplete', async () => {
    renderPanel()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit Batch' }))
    })

    expect(await screen.findByText('Row 1: driver and tag are required')).toBeTruthy()
    expect(api.writeTag).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Write All' })).toBeNull()
  })

  it('confirms the batch before writing, then sends one command per row', async () => {
    vi.mocked(api.writeTag).mockResolvedValue({ success: true })
    renderPanel()

    await pickDriver(0, 'plc1 (modbus-tcp)')
    fillRow(0, 'temp', '42.5')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Row' }))
    })
    await pickDriver(1, 'plc2 (s7)')
    await pickType(1, 'bool')
    fillRow(1, 'motor', 'true')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit Batch' }))
    })

    // Confirmation lists every staged command; nothing is written yet.
    expect(await screen.findByText('Confirm Batch Write')).toBeTruthy()
    expect(screen.getByText(/The following 2 command/)).toBeTruthy()
    expect(screen.getByText('[plc1] temp = 42.5 (float32)')).toBeTruthy()
    expect(screen.getByText('[plc2] motor = true (bool)')).toBeTruthy()
    expect(api.writeTag).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Write All' }))
    })

    await waitFor(() => expect(api.writeTag).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.writeTag).mock.calls[0][0]).toEqual({
      driver: 'plc1',
      tag: 'temp',
      type: 'float32',
      value: 42.5,
    })
    expect(vi.mocked(api.writeTag).mock.calls[1][0]).toEqual({
      driver: 'plc2',
      tag: 'motor',
      type: 'bool',
      value: true,
    })
    expect(await screen.findAllByText('Success')).toHaveLength(2)
    expect(screen.getByText('2 succeeded, 0 failed')).toBeTruthy()
  })

  it('surfaces per-row failures without aborting the rest of the batch', async () => {
    vi.mocked(api.writeTag)
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('driver not connected'))
    renderPanel()

    await pickDriver(0, 'plc1 (modbus-tcp)')
    fillRow(0, 'temp', '1')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Row' }))
    })
    await pickDriver(1, 'plc2 (s7)')
    await pickType(1, 'bool')
    fillRow(1, 'motor', 'true')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit Batch' }))
    })
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Write All' }))
    })

    await waitFor(() => expect(api.writeTag).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Failed')).toBeTruthy()
    expect(screen.getByText(/driver not connected/)).toBeTruthy()
    expect(screen.getByText('1 succeeded, 1 failed')).toBeTruthy()
  })
})
