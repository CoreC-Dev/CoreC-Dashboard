// @vitest-environment jsdom
// The quick-edit form derives its fields from the settings registry; the
// http form must expose exactly one headers input (the registry field).
import { describe, expect, it } from 'vitest'
import { getTransportFields } from '@/features/admin/transportDetail/EditConfigSection'

describe('transport quick-edit field resolution', () => {
  it('http exposes exactly one headers field, sourced from the registry', () => {
    const fields = getTransportFields('http')
    const headers = fields.filter((f) => f.key === 'headers')

    expect(headers).toHaveLength(1)
    expect(headers[0]?.labelKey).toBe('settings.headers')
    expect(headers[0]?.kind).toBe('text')
    expect(headers[0]?.group).toBe('settings')
  })

  it('no curated key is duplicated for any supported transport type', () => {
    for (const type of ['mqtt', 'http', 'notify']) {
      const keys = getTransportFields(type).map((f) => f.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('returns no fields for an unsupported transport type', () => {
    expect(getTransportFields('opcua')).toEqual([])
  })
})
