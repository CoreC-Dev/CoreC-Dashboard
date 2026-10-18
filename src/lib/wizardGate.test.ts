import { describe, expect, it } from 'vitest'
import { getDriverFieldRegistry, getTransportFieldRegistry } from '@/lib/settingsRegistry'
import { missingRequiredSettingLabels } from '@/lib/wizardGate'

describe('missingRequiredSettingLabels (C-A5)', () => {
  it('lists label keys of required fields whose value is empty', () => {
    const registry = getDriverFieldRegistry('modbus-tcp')
    // host is required; port carries a registry default and is not.
    expect(missingRequiredSettingLabels(registry, {})).toEqual(['settings.host'])

    // Filling host clears the list.
    expect(missingRequiredSettingLabels(registry, { host: '10.0.0.1' })).toEqual([])
  })

  it('treats empty strings as missing but keeps numbers (including 0)', () => {
    const registry = getTransportFieldRegistry('mqtt')
    expect(missingRequiredSettingLabels(registry, { broker: '' })).toContain('settings.brokerUrl')
    expect(missingRequiredSettingLabels(registry, { broker: 'tcp://b:1883' })).not.toContain(
      'settings.brokerUrl',
    )
    // A numeric 0 is a VALUE, not a gap.
    expect(
      missingRequiredSettingLabels(getDriverFieldRegistry('modbus-tcp'), { host: 'h' }),
    ).toEqual([])
  })

  it('returns an empty list for an absent registry or a full form', () => {
    expect(missingRequiredSettingLabels(undefined, {})).toEqual([])
    const registry = getDriverFieldRegistry('modbus-tcp')!
    const settings: Record<string, unknown> = {}
    for (const g of registry.groups) {
      for (const f of g.fields) {
        if (f.required) settings[f.key] = f.default ?? 'x'
      }
    }
    expect(missingRequiredSettingLabels(registry, settings)).toEqual([])
  })
})
