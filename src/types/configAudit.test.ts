import { describe, expect, it } from 'vitest'
import { configAuditEntrySchema, configAuditResponseSchema } from '@/types/api'

// Config audit action contract: the backend only records reload/patch
// (hub/executor recordConfigAudit call sites); backup restore goes through
// Reload and lands as reload.

describe('configAuditEntrySchema — action enum', () => {
  it('accepts exactly the actions the backend produces: reload and patch', () => {
    expect(configAuditEntrySchema.shape.action.options).toEqual(['reload', 'patch'])
    for (const action of ['reload', 'patch']) {
      const res = configAuditEntrySchema.safeParse({ at: '2026-01-01T12:00:00Z', action })
      expect(res.success).toBe(true)
    }
  })

  it('rejects restore — no backend call site emits it', () => {
    const res = configAuditEntrySchema.safeParse({
      at: '2026-01-01T12:00:00Z',
      action: 'restore',
    })
    expect(res.success).toBe(false)
  })
})

describe('configAuditResponseSchema', () => {
  it('parses a newest-first trail of reload/patch entries', () => {
    const res = configAuditResponseSchema.safeParse({
      changes: [
        {
          at: '2026-01-01T12:00:00Z',
          action: 'patch',
          remote: '192.168.1.10:51424',
          keys: ['drivers.plc1.settings.port'],
        },
        { at: '2026-01-01T11:00:00Z', action: 'reload', details: 'backup restored' },
      ],
      count: 2,
    })
    expect(res.success).toBe(true)
  })

  it('rejects an entry whose action is outside the enum', () => {
    const res = configAuditResponseSchema.safeParse({
      changes: [{ at: '2026-01-01T12:00:00Z', action: 'restore' }],
      count: 1,
    })
    expect(res.success).toBe(false)
  })
})
