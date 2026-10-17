// @vitest-environment jsdom
// Component-level test for the Config Center's server-side backups panel
// (ConfigBackupsPanel). The endpoint layer is mocked (real hook wiring:
// useConfigBackups / useConfigBackupContent / useRestoreConfigBackup), i18n
// is forced to English for deterministic content assertions.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigBackupsPanel } from '@/components/admin/ConfigBackupsPanel'
import i18n from '@/i18n'
import { useConnectionStore } from '@/stores/connectionStore'
import type { ConfigBackupRestoreResult } from '@/types/api'

// Mock the endpoint surface the panel's hooks call. hooks/index.ts is REAL,
// so the queries run through the genuine useConnectedQuery gating.
vi.mock('@/api/endpoints', () => ({
  getConfigsRaw: vi.fn(),
  getConfigBackups: vi.fn(),
  getConfigBackupContent: vi.fn(),
  restoreConfigBackup: vi.fn(),
}))

import * as api from '@/api/endpoints'

const BACKUPS = [
  { name: '1767225600123456789.yaml', timestamp: '2026-01-01T00:00:00Z', size: 2048 },
  { name: '1767225500000000000.yaml', timestamp: '2025-12-31T23:58:20Z', size: 1987 },
]

const CURRENT_YAML = 'global:\n  log-level: info\n  api:\n    listen: ":9090"\n'
const BACKUP_YAML = 'global:\n  log-level: debug\n  api:\n    listen: ":9090"\n'

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <ConfigBackupsPanel />
    </QueryClientProvider>,
  )
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  vi.clearAllMocks()
  useConnectionStore.setState({ isConnected: true })
  vi.mocked(api.getConfigBackups).mockResolvedValue({ backups: BACKUPS })
  vi.mocked(api.getConfigsRaw).mockResolvedValue(CURRENT_YAML)
  vi.mocked(api.getConfigBackupContent).mockResolvedValue(BACKUP_YAML)
})

// vitest runs without globals:true — @testing-library/react's auto-cleanup
// never registers; clean the DOM explicitly between tests.
afterEach(() => {
  cleanup()
})

describe('ConfigBackupsPanel', () => {
  it('renders the backup rows with timestamp and size', async () => {
    renderPanel()

    expect(await screen.findByText(/1767225600123456789\.yaml/)).toBeTruthy()
    expect(screen.getByText(/2.0 KB/)).toBeTruthy()
    expect(screen.getByText(/1.9 KB/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Restore' }).length).toBe(2)
  })

  it('renders the empty state when no backups are retained', async () => {
    vi.mocked(api.getConfigBackups).mockResolvedValue({ backups: [] })
    renderPanel()

    expect(await screen.findByText('No server-side backups yet')).toBeTruthy()
  })

  it('opens the diff dialog and renders the current → backup line diff', async () => {
    renderPanel()

    await screen.findByText(/1767225600123456789\.yaml/)
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Diff' })[0])
    })

    // The dialog fetches the backup content lazily and diffs it against the
    // current raw config: log-level info → debug renders as a -/+ pair.
    expect(await screen.findByText('Backup vs Current Config')).toBeTruthy()
    await waitFor(() => {
      expect(api.getConfigBackupContent).toHaveBeenCalledWith('1767225600123456789.yaml')
    })
    expect(await screen.findByText('log-level: info')).toBeTruthy()
    expect(screen.getByText('log-level: debug')).toBeTruthy()
  })

  it('requires the double confirmation before restoring, then calls the endpoint', async () => {
    const restored: ConfigBackupRestoreResult = { outcome: 'restored' }
    vi.mocked(api.restoreConfigBackup).mockResolvedValue(restored)
    renderPanel()

    // Step 1: "Restore" opens the details dialog — nothing sent yet.
    await screen.findByText(/1767225600123456789\.yaml/)
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0])
    })
    expect(await screen.findByText('Restore Config Backup')).toBeTruthy()
    expect(api.restoreConfigBackup).not.toHaveBeenCalled()

    // Step 1 → 2: "Continue" opens the FINAL overwrite confirmation.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    })
    expect(await screen.findByText('Overwrite Active Configuration?')).toBeTruthy()
    expect(api.restoreConfigBackup).not.toHaveBeenCalled()

    // Step 2: "Restore Now" fires the POST.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restore Now' }))
    })

    await waitFor(() => {
      expect(api.restoreConfigBackup).toHaveBeenCalledWith('1767225600123456789.yaml')
    })
    expect(await screen.findByText('Backup restored — configuration hot-reloaded')).toBeTruthy()
  })

  it('shows the server message verbatim when the restore is rejected (400)', async () => {
    const rejected: ConfigBackupRestoreResult = {
      outcome: 'rejected',
      status: 400,
      error: 'config backup failed validation: api.secret must be set',
    }
    vi.mocked(api.restoreConfigBackup).mockResolvedValue(rejected)
    renderPanel()

    await screen.findByText(/1767225600123456789\.yaml/)
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0])
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restore Now' }))
    })

    expect(
      await screen.findByText(
        'Restore refused (HTTP 400): config backup failed validation: api.secret must be set',
      ),
    ).toBeTruthy()
  })

  it('keeps the panel usable when cancelling at either confirmation step', async () => {
    renderPanel()

    await screen.findByText(/1767225600123456789\.yaml/)
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0])
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })

    // Back at the list — no request was ever sent.
    expect(api.restoreConfigBackup).not.toHaveBeenCalled()
    expect(screen.getByText(/1767225600123456789\.yaml/)).toBeTruthy()
  })
})
