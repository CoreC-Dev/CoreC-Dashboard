// C-C4: pure narrowing rules for the write page's dead-letter list.
import { describe, expect, it } from 'vitest'
import { filterWriteDeadLetters } from '@/lib/deadLetterFilter'
import type { DeadLetterEntry } from '@/types/models'

const dl = (driver: string, tag: string, error: string): DeadLetterEntry => ({
  command: { driver, tag, value: 1, type: 'float32' },
  error,
  failed_at: '2026-10-19T00:00:00Z',
  attempts: 3,
})

const ENTRIES = [
  dl('plc1', 'temperature', 'write timeout after 3 retries'),
  dl('plc2', 'pump_speed', 'driver not connected'),
  dl('plc1', 'level', 'unsupported patch key(s)'),
]

describe('filterWriteDeadLetters (C-C4)', () => {
  it('empty term and "all" driver keep every entry', () => {
    expect(filterWriteDeadLetters(ENTRIES, '', 'all')).toHaveLength(3)
  })

  it('free text matches tag names and verbatim error text, case-insensitively', () => {
    expect(filterWriteDeadLetters(ENTRIES, 'pump', 'all')).toHaveLength(1)
    expect(filterWriteDeadLetters(ENTRIES, 'TIMEOUT', 'all')).toHaveLength(1)
    expect(filterWriteDeadLetters(ENTRIES, 'nonexistent', 'all')).toHaveLength(0)
  })

  it('driver filter narrows to that driver and combines with text', () => {
    expect(filterWriteDeadLetters(ENTRIES, '', 'plc1')).toHaveLength(2)
    expect(filterWriteDeadLetters(ENTRIES, '', 'plc2')).toHaveLength(1)
    expect(filterWriteDeadLetters(ENTRIES, 'temperature', 'plc2')).toHaveLength(0)
    expect(filterWriteDeadLetters(ENTRIES, 'temperature', 'plc1')).toHaveLength(1)
  })
})
