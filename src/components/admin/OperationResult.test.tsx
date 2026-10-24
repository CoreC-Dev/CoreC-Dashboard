// @vitest-environment jsdom
// OperationResult: the shared transient feedback strip — one
// component instead of page-local never-clearing status lines spelled
// three different ways. Success green / error red, operation context,
// 5s auto-fade, manual close — and a repeat of the same operation must
// re-show the strip.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperationResult } from '@/components/admin/OperationResult'
import i18n from '@/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

const OK = { type: 'success' as const, text: 'Config applied and hot-reloaded.' }
const FAIL = { type: 'error' as const, text: 'engine busy' }

describe('OperationResult rendering', () => {
  it('renders nothing without a status', () => {
    const { container } = render(<OperationResult status={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a success strip with role=status, the context label and the text', () => {
    render(<OperationResult status={OK} context="Connection parameters" />)

    const strip = screen.getByRole('status')
    expect(strip).toHaveTextContent('Connection parameters')
    expect(strip).toHaveTextContent('Config applied and hot-reloaded.')
    expect(strip.className).toContain('bg-status-running/10')
  })

  it('shows an error strip with role=alert', () => {
    render(<OperationResult status={FAIL} />)

    const strip = screen.getByRole('alert')
    expect(strip).toHaveTextContent('engine busy')
    expect(strip.className).toContain('bg-status-error/10')
  })
})

describe('OperationResult dismissal', () => {
  it('auto-fades after 5s and notifies the parent', () => {
    const onDismiss = vi.fn()
    render(<OperationResult status={OK} onDismiss={onDismiss} />)

    act(() => {
      vi.advanceTimersByTime(4999)
    })
    expect(screen.getByRole('status')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByRole('status')).toBeNull()
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('auto-fade disabled at autoDismissMs=0 (the parent owns clearing)', () => {
    render(<OperationResult status={OK} autoDismissMs={0} />)

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('closes manually via the X button and notifies the parent', () => {
    const onDismiss = vi.fn()
    render(<OperationResult status={OK} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('re-shows when the same operation repeats (new status object, same text)', () => {
    const { rerender } = render(<OperationResult status={OK} />)

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.queryByRole('status')).toBeNull()

    // Re-applying produces a fresh object with identical text — the strip
    // must come back, not stay hidden on the stale verdict.
    rerender(<OperationResult status={{ type: 'success', text: OK.text }} />)
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('does not restart the fade on plain re-renders carrying the same object', () => {
    const { rerender } = render(<OperationResult status={OK} />)

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    rerender(<OperationResult status={OK} />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    // 3s + re-render + 2s = the single 5s window elapsed: hidden.
    expect(screen.queryByRole('status')).toBeNull()
  })
})
