// @vitest-environment jsdom
// Component test for the Alerts page's dead-letter card with batch replay.
// The endpoint layer is mocked (writeTag); the REAL useWriteTag mutation
// wiring (per-write cache invalidation included) runs inside a real
// QueryClient. i18n forced to English for deterministic assertions.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeadLetterReplayList, filterDeadLetters } from '@/components/monitor/DeadLetterReplayList'
import i18n from '@/i18n'
import type { DeadLetterEntry } from '@/types/models'

// The dialogs live in a second module since the file split; on cold
// transforms the confirm-dialog query can outlive the 1s default timeout.
configure({ asyncUtilTimeout: 4000 })

vi.mock('@/api/endpoints', () => ({
  writeTag: vi.fn(),
}))

import * as api from '@/api/endpoints'

const ENTRIES: DeadLetterEntry[] = [
  {
    command: {
      driver: 'plc1',
      device: 'meter-01',
      tag: 'pump',
      value: true,
      type: 'bool',
      // Stamped by the server on the original write — must NOT be re-sent.
      source: 'api',
      remote: '192.168.1.10:51424',
    } as DeadLetterEntry['command'],
    error: 'driver disconnected',
    failed_at: '2026-01-01T00:00:00Z',
    attempts: 3,
  },
  {
    command: { driver: 'plc2', tag: 'temp', value: 50, type: 'float32' },
    error: 'write timeout',
    failed_at: '2026-01-01T00:01:00Z',
    attempts: 3,
  },
]

function renderList(entries: DeadLetterEntry[] = ENTRIES) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <DeadLetterReplayList
        deadLetters={entries}
        isLoading={false}
        isError={false}
        error={null}
        isFetching={false}
        onRefresh={vi.fn()}
      />
    </QueryClientProvider>,
  )
}

/** Checks the row checkbox of the i-th entry (header checkbox is index 0). */
const checkRow = (index: number) => {
  const boxes = screen.getAllByRole('checkbox')
  fireEvent.click(boxes[index + 1])
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  vi.clearAllMocks()
})

// vitest runs without globals:true — @testing-library/react's auto-cleanup
// never registers; clean the DOM explicitly between tests.
afterEach(() => {
  cleanup()
})

describe('DeadLetterReplayList', () => {
  it('renders the dead letter rows and disables batch replay with nothing selected', async () => {
    renderList()

    expect(await screen.findByText('[plc1] Tag: pump = true')).toBeTruthy()
    expect(screen.getByText('[plc2] Tag: temp = 50')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Replay Selected (0)' })).toBeDisabled()
  })

  it('lists the sub-device on every entry so same-name tags stay distinguishable (B06)', async () => {
    renderList()

    // Entry 1 carries a device; entry 2 has none and falls back to '-'.
    expect(await screen.findByText('Device: meter-01')).toBeTruthy()
    expect(screen.getByText('Device: -')).toBeTruthy()
  })

  it('requires the batch confirmation dialog before any write is sent', async () => {
    vi.mocked(api.writeTag).mockResolvedValue({ success: true })
    renderList()

    checkRow(0)
    checkRow(1)
    const batchBtn = screen.getByRole('button', { name: 'Replay Selected (2)' })
    expect(batchBtn).toBeEnabled()

    await act(async () => {
      fireEvent.click(batchBtn)
    })

    // The confirm dialog lists every staged command — and nothing is sent.
    expect(await screen.findByText('Replay 2 Dead Letter Command(s)')).toBeTruthy()
    expect(screen.getByText('[plc1/meter-01] pump = true (bool)')).toBeTruthy()
    expect(screen.getByText('[plc2] temp = 50 (float32)')).toBeTruthy()
    expect(screen.getByText(/writes directly to PLC coils\/registers/)).toBeTruthy()
    expect(api.writeTag).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replay Selected' }))
    })

    expect(api.writeTag).toHaveBeenCalledTimes(2)
  })

  it('re-sends each selected command one by one with a CLEAN command payload', async () => {
    // The recorded command carries server-stamped audit fields (source/
    // remote); the replay must send only the write fields — POST /write
    // stamps provenance itself at its own trust boundary.
    vi.mocked(api.writeTag).mockResolvedValue({ success: true })
    renderList()

    checkRow(0)
    checkRow(1)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replay Selected (2)' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replay Selected' }))
    })

    await waitFor(() => expect(api.writeTag).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.writeTag).mock.calls[0][0]).toEqual({
      driver: 'plc1',
      device: 'meter-01',
      tag: 'pump',
      value: true,
      type: 'bool',
    })
    expect(vi.mocked(api.writeTag).mock.calls[1][0]).toEqual({
      driver: 'plc2',
      tag: 'temp',
      value: 50,
      type: 'float32',
    })
    // Per-item results: both succeeded.
    expect(await screen.findAllByText('Success')).toHaveLength(2)
    expect(screen.getByText('2 succeeded, 0 failed')).toBeTruthy()
  })

  it('reports per-item failures with the server message verbatim', async () => {
    vi.mocked(api.writeTag)
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('driver not connected'))
    renderList()

    checkRow(0)
    checkRow(1)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replay Selected (2)' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replay Selected' }))
    })

    // The batch runs to the end — a failed item does not abort the rest.
    await waitFor(() => expect(api.writeTag).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Failed')).toBeTruthy()
    expect(screen.getByText(/driver not connected/)).toBeTruthy()
    expect(screen.getByText('1 succeeded, 1 failed')).toBeTruthy()
  })

  it('select-all stages every visible entry for the batch', async () => {
    vi.mocked(api.writeTag).mockResolvedValue({ success: true })
    renderList()

    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByRole('button', { name: 'Replay Selected (2)' })).toBeEnabled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replay Selected (2)' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replay Selected' }))
    })

    await waitFor(() => expect(api.writeTag).toHaveBeenCalledTimes(2))
  })

  it('requires the per-entry confirmation dialog before a single replay is sent', async () => {
    vi.mocked(api.writeTag).mockResolvedValue({ success: true })
    renderList()

    // The row button only STAGES the replay — a confirm dialog opens
    // (C-C1: a dead letter's last write already failed, so nothing is
    // re-sent until the operator has seen the command and confirmed).
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Replay Command' })[0])
    })

    expect(await screen.findByText('Replay Dead Letter Command')).toBeTruthy()
    // The dialog lists the exact command, the recorded failure reason…
    expect(screen.getByText(/This command previously failed \(driver disconnected\)/)).toBeTruthy()
    expect(screen.getByText('[plc1/meter-01] pump = true (bool)')).toBeTruthy()
    // "3 attempts exhausted" appears in both rows and once more in the dialog.
    expect(screen.getAllByText('3 attempts exhausted').length).toBe(3)
    // …and nothing has been sent yet.
    expect(api.writeTag).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm re-send' }))
    })

    await waitFor(() =>
      expect(api.writeTag).toHaveBeenCalledWith({
        driver: 'plc1',
        device: 'meter-01',
        tag: 'pump',
        value: true,
        type: 'bool',
      }),
    )
    expect(api.writeTag).toHaveBeenCalledTimes(1)
  })

  it('single replay: cancel sends nothing', async () => {
    renderList()

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Replay Command' })[0])
    })
    expect(await screen.findByText('Replay Dead Letter Command')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })
    await waitFor(() => expect(screen.queryByText('Replay Dead Letter Command')).toBeNull())
    expect(api.writeTag).not.toHaveBeenCalled()
  })
})

describe('DeadLetterReplayList — search & driver filter (B10)', () => {
  it('filterDeadLetters narrows by free text over driver/tag and by exact driver', () => {
    const all = filterDeadLetters(ENTRIES, '', 'all')
    expect(all).toHaveLength(2)

    // Text matches the tag…
    expect(filterDeadLetters(ENTRIES, 'pump', 'all')).toHaveLength(1)
    // …and the driver…
    expect(filterDeadLetters(ENTRIES, 'plc2', 'all')).toHaveLength(1)
    // …and nothing else.
    expect(filterDeadLetters(ENTRIES, 'nonexistent', 'all')).toHaveLength(0)
    // Driver filter narrows independently…
    expect(filterDeadLetters(ENTRIES, '', 'plc2')).toHaveLength(1)
    // …and combines with text conjunctively.
    expect(filterDeadLetters(ENTRIES, 'pump', 'plc2')).toHaveLength(0)
  })

  it('the search input narrows the rendered rows', async () => {
    renderList()

    expect(await screen.findByText('[plc1] Tag: pump = true')).toBeTruthy()
    expect(screen.getByText('[plc2] Tag: temp = 50')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Search dead letters (driver/tag)…'), {
      target: { value: 'pump' },
    })

    await waitFor(() => {
      expect(screen.queryByText('[plc2] Tag: temp = 50')).toBeNull()
    })
    expect(screen.getByText('[plc1] Tag: pump = true')).toBeTruthy()
  })

  it('a search with no hits shows the no-matching state instead of rows', async () => {
    renderList()

    fireEvent.change(screen.getByPlaceholderText('Search dead letters (driver/tag)…'), {
      target: { value: 'no-such-tag' },
    })

    expect(await screen.findByText('No dead letters match the current filter')).toBeTruthy()
    expect(screen.queryByText('[plc1] Tag: pump = true')).toBeNull()
  })

  it('select-all states and stages the FILTERED visible set only', async () => {
    vi.mocked(api.writeTag).mockResolvedValue({ success: true })
    renderList()

    expect(await screen.findByText('Select all visible dead letters (2)')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Search dead letters (driver/tag)…'), {
      target: { value: 'pump' },
    })
    await screen.findByText('Select all visible dead letters (1)')

    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByRole('button', { name: 'Replay Selected (1)' })).toBeEnabled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replay Selected (1)' }))
    })
    // The confirm dialog lists ONLY the visible (filtered) entry.
    expect(await screen.findByText('Replay 1 Dead Letter Command(s)')).toBeTruthy()
    expect(screen.getByText('[plc1/meter-01] pump = true (bool)')).toBeTruthy()
    expect(screen.queryByText('[plc2] temp = 50 (float32)')).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replay Selected' }))
    })
    await waitFor(() => expect(api.writeTag).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.writeTag).mock.calls[0][0].driver).toBe('plc1')
  })

  it('renders the driver filter select with its accessible label', async () => {
    renderList()

    expect(await screen.findByRole('combobox', { name: 'Driver' })).toBeTruthy()
  })
})
