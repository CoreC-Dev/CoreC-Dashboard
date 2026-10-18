// @vitest-environment jsdom
// C-B1 regression: the runtime rules table's Edit button must open the SAME
// RuleWizard the config section uses (delayed apply via the working
// config) — NOT a second editor that hot-reloads the engine directly.
// Zero PUT /configs until the operator explicitly applies.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { RulesPage } from '@/features/admin/RulesPage'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'
import { useConnectionStore } from '@/stores/connectionStore'

// The page + wizard render heavy grids; under full-suite load on a 2-core
// box they can exceed the 5s default. 15s mirrors the BatchWritePanel
// suite-timeout precedent.
vi.setConfig({ testTimeout: 15_000 })

// vi.mock factories are hoisted above const initializers — build the YAML
// via vi.hoisted so the factory can reference it.
const RAW_YAML = vi.hoisted(() =>
  [
    'drivers:',
    '  - name: plc1',
    '    type: modbus-tcp',
    '    settings:',
    '      host: 192.168.1.100',
    '    tags:',
    '      - name: temp',
    '        address: "40001"',
    '        type: float32',
    'transports:',
    '  - name: mqtt-out',
    '    type: mqtt',
    '    settings:',
    '      broker: tcp://broker:1883',
    'rules:',
    '  - name: forward-all',
    '    match: ALL',
    '    action: forward',
    '    target: mqtt-out',
    '    priority: 100',
  ].join('\n'),
)

vi.mock('@/api/endpoints', () => ({
  getRules: vi.fn().mockResolvedValue({
    rules: [
      {
        index: 0,
        name: 'forward-all',
        type: 'simple',
        match: 'ALL',
        action: 'forward',
        target: 'mqtt-out',
        // CoreC serializes targets as null (not []) when empty.
        targets: null,
        priority: 100,
        continue: false,
        disabled: false,
        hit_count: 3,
        hit_at: '0001-01-01T00:00:00Z',
        miss_count: 1,
        miss_at: '0001-01-01T00:00:00Z',
      },
    ],
  }),
  getConfigsRaw: vi.fn().mockResolvedValue(RAW_YAML),
  updateConfigs: vi.fn().mockResolvedValue(undefined),
}))

import * as api from '@/api/endpoints'

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RulesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeAll(async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  useConnectionStore.getState().setConnected(true)
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  vi.clearAllMocks()
  useConfigStore.getState().reset()
  // Seed the working config from the server, exactly like useAutoLoadConfig
  // does on a real admin mount.
  useConfigStore.getState().seedFromServer(RAW_YAML)
})

// vitest runs without globals:true — @testing-library/react's auto-cleanup
// never registers; clean the DOM and the store explicitly between tests.
afterEach(() => {
  cleanup()
  useConfigStore.getState().reset()
})

describe('RulesPage runtime-row edit unification (C-B1)', () => {
  it('runtime row Edit opens the shared RuleWizard — not a direct hot-reload editor', async () => {
    renderPage()

    // Both sections list the rule; the runtime row appears once the
    // mocked rules query resolves (a tick after the synchronous config
    // row) — wait for BOTH.
    await waitFor(() => expect(screen.getAllByText('forward-all').length).toBe(2))

    // Two Edit affordances exist: the config section pencil and the
    // runtime row button. The runtime one is the second.
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBe(2))
    const editButtons = screen.getAllByRole('button', { name: 'Edit' })
    await act(async () => {
      fireEvent.click(editButtons[1])
    })

    // The SAME wizard the config section uses opens, prefilled with the
    // rule — and nothing is sent to the engine.
    expect(await screen.findByText('Edit Rule')).toBeTruthy()
    const nameInput = screen.getByPlaceholderText('forward-to-cloud')
    expect((nameInput as HTMLInputElement).value).toBe('forward-all')
    expect(screen.getByDisplayValue('ALL')).toBeTruthy()
    expect(api.updateConfigs).not.toHaveBeenCalled()
  })

  it('finishing the wizard stages the edit in the working config — apply stays explicit, zero PUT', async () => {
    renderPage()

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBe(2))
    const editButtons = screen.getAllByRole('button', { name: 'Edit' })
    await act(async () => {
      fireEvent.click(editButtons[1])
    })
    expect(await screen.findByText('Edit Rule')).toBeTruthy()

    // Change the match expression (step 1).
    const matchArea = screen.getByPlaceholderText('driver == "plc-modbus" && value > 50')
    await act(async () => {
      fireEvent.change(matchArea, { target: { value: 'value > 80' } })
    })

    // Walk the wizard: basics → action → target → preview → Finish.
    for (const label of ['Next', 'Next', 'Next']) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: label }))
      })
    }
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    })

    // The wizard closes and the edit is STAGED: the unsaved-changes banner
    // appears, but no PUT /configs has fired — the operator still has the
    // shared apply-confirmation gate ahead of them.
    await waitFor(() => expect(screen.queryByText('Edit Rule')).toBeNull())
    expect(await screen.findByText(/You have unsaved configuration changes/)).toBeTruthy()
    // Header + unsaved-changes banner both offer the (enabled) apply gate —
    // the operator still has the shared confirmation dialog ahead.
    const applyButtons = screen.getAllByRole('button', { name: 'Apply Changes' })
    expect(applyButtons.length).toBe(2)
    for (const b of applyButtons) expect(b).toBeEnabled()
    expect(api.updateConfigs).not.toHaveBeenCalled()

    // The staged rule is visible in the config-managed section.
    expect(screen.getByText('value > 80')).toBeTruthy()
  })
})
