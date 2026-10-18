import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { safePersist, safePersistSession, safeRead, safeReadSession } from '@/lib/storage'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('lib/storage — safePersist (A-11)', () => {
  it('writes the value and returns true on success', () => {
    expect(safePersist('k', 'v')).toBe(true)
    expect(localStorage.getItem('k')).toBe('v')
  })

  it('returns false instead of throwing when the write fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded', 'QuotaExceededError')
    })
    // Must not throw — callers rely on the boolean to surface the failure.
    expect(safePersist('k', 'v')).toBe(false)
  })

  it('safeRead returns the stored value and null on read failure', () => {
    expect(safePersist('k', 'v')).toBe(true)
    expect(safeRead('k')).toBe('v')
    expect(safeRead('missing')).toBeNull()

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'InvalidStateError')
    })
    expect(safeRead('k')).toBeNull()
  })
})

describe('lib/storage — sessionStorage helpers', () => {
  it('safePersistSession writes and reports failures the same way', () => {
    expect(safePersistSession('sk', 'sv')).toBe(true)
    expect(safeReadSession('sk')).toBe('sv')

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded', 'QuotaExceededError')
    })
    expect(safePersistSession('sk2', 'sv2')).toBe(false)
  })

  it('safeReadSession returns null on read failure', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'InvalidStateError')
    })
    expect(safeReadSession('sk')).toBeNull()
  })
})
