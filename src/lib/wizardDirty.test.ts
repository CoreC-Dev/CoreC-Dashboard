// Pure-function tests for the wizard dirty-draft predicates (C-A2).
// The contract: EDIT mode is dirty only when the draft diverges from the
// pre-filled entity; CREATE mode is dirty once the user advanced or chose
// anything — and a freshly opened, untouched wizard is NEVER dirty (no
// nag on cancel).
import { describe, expect, it } from 'vitest'
import type { DriverDraftInput, RuleDraftInput, TransportDraftInput } from '@/lib/wizardDirty'
import { isDriverDraftDirty, isRuleDraftDirty, isTransportDraftDirty } from '@/lib/wizardDirty'
import type { DriverConfig, TransportConfig } from '@/types/config'

const EXISTING_DRIVER: DriverConfig = {
  name: 'plc1',
  type: 'modbus-tcp',
  settings: { host: '192.168.1.100', port: 502 },
  tags: [{ name: 'temp', address: '40001', type: 'float32' }],
  'tags-file': './tags.yaml',
}

const EXISTING_TRANSPORT: TransportConfig = {
  name: 'mqtt-out',
  type: 'mqtt',
  settings: { broker: 'tcp://broker:1883' },
  'batch-size': 10,
}

describe('isDriverDraftDirty', () => {
  it('create mode: untouched step 0 is not dirty', () => {
    const draft: DriverDraftInput = {
      currentStep: 0,
      isEdit: false,
      selectedType: null,
      driverName: '',
      settings: {},
      tags: [],
      tagsFile: '',
      tagsInterval: '',
    }
    expect(isDriverDraftDirty(draft)).toBe(false)
  })

  it('create mode: a chosen type or an advanced step is dirty', () => {
    const base: DriverDraftInput = {
      currentStep: 0,
      isEdit: false,
      selectedType: null,
      driverName: '',
      settings: {},
      tags: [],
      tagsFile: '',
      tagsInterval: '',
    }
    expect(isDriverDraftDirty({ ...base, selectedType: 'modbus-tcp' })).toBe(true)
    expect(isDriverDraftDirty({ ...base, currentStep: 1 })).toBe(true)
  })

  it('edit mode: pre-filled draft is not dirty; any divergence is', () => {
    const base: DriverDraftInput = {
      currentStep: 3,
      isEdit: true,
      existing: EXISTING_DRIVER,
      selectedType: 'modbus-tcp',
      driverName: 'plc1',
      settings: { host: '192.168.1.100', port: 502 },
      tags: [{ name: 'temp', address: '40001', type: 'float32' }],
      tagsFile: './tags.yaml',
      tagsInterval: '',
    }
    expect(isDriverDraftDirty(base)).toBe(false)
    expect(isDriverDraftDirty({ ...base, settings: { host: '10.0.0.5', port: 502 } })).toBe(true)
    expect(
      isDriverDraftDirty({
        ...base,
        tags: [...base.tags, { name: 'pump', address: '1', type: 'bool' }],
      }),
    ).toBe(true)
    expect(isDriverDraftDirty({ ...base, driverName: 'renamed' })).toBe(true)
    expect(isDriverDraftDirty({ ...base, tagsFile: './other.yaml' })).toBe(true)
  })
})

describe('isTransportDraftDirty', () => {
  it('edit mode: pre-filled draft is not dirty; changed toplevel is', () => {
    const base: TransportDraftInput = {
      currentStep: 2,
      isEdit: true,
      existing: EXISTING_TRANSPORT,
      selectedType: 'mqtt',
      transportName: 'mqtt-out',
      settings: { broker: 'tcp://broker:1883' },
      toplevel: { 'batch-size': 10 },
      existingToplevel: { 'batch-size': 10 },
    }
    expect(isTransportDraftDirty(base)).toBe(false)
    expect(isTransportDraftDirty({ ...base, toplevel: { 'batch-size': 99 } })).toBe(true)
    expect(isTransportDraftDirty({ ...base, settings: { broker: 'tcp://other:1883' } })).toBe(true)
    expect(isTransportDraftDirty({ ...base, transportName: 'renamed' })).toBe(true)
  })

  it('create mode: untouched is clean, chosen type is dirty', () => {
    const base: TransportDraftInput = {
      currentStep: 0,
      isEdit: false,
      selectedType: null,
      transportName: '',
      settings: {},
      toplevel: {},
    }
    expect(isTransportDraftDirty(base)).toBe(false)
    expect(isTransportDraftDirty({ ...base, selectedType: 'mqtt' })).toBe(true)
    expect(isTransportDraftDirty({ ...base, currentStep: 1 })).toBe(true)
  })
})

describe('isRuleDraftDirty', () => {
  it('create mode: defaults are clean; any input is dirty', () => {
    const base: RuleDraftInput = {
      currentStep: 0,
      isEdit: false,
      ruleName: '',
      match: 'ALL',
      priority: 100,
      action: 'forward',
      target: '',
      targets: [],
      transformExpr: '',
      tagRename: '',
      continueFlag: false,
    }
    expect(isRuleDraftDirty(base)).toBe(false)
    expect(isRuleDraftDirty({ ...base, ruleName: 'my-rule' })).toBe(true)
    expect(isRuleDraftDirty({ ...base, match: 'value > 50' })).toBe(true)
    expect(isRuleDraftDirty({ ...base, priority: 10 })).toBe(true)
    expect(isRuleDraftDirty({ ...base, action: 'drop' })).toBe(true)
    expect(isRuleDraftDirty({ ...base, currentStep: 1 })).toBe(true)
  })

  it('edit mode: pre-filled draft is not dirty; divergence is', () => {
    const base: RuleDraftInput = {
      currentStep: 2,
      isEdit: true,
      existing: {
        name: 'forward-all',
        match: 'ALL',
        priority: 100,
        action: 'forward',
        target: 'mqtt-out',
        targets: ['a', 'b'],
        transform: { expression: 'value * 2' },
        continue: true,
      },
      ruleName: 'forward-all',
      match: 'ALL',
      priority: 100,
      action: 'forward',
      target: 'mqtt-out',
      targets: ['a', 'b'],
      transformExpr: 'value * 2',
      tagRename: '',
      continueFlag: true,
    }
    expect(isRuleDraftDirty(base)).toBe(false)
    expect(isRuleDraftDirty({ ...base, match: 'tag == "x"' })).toBe(true)
    expect(isRuleDraftDirty({ ...base, targets: ['a'] })).toBe(true)
    expect(isRuleDraftDirty({ ...base, continueFlag: false })).toBe(true)
    expect(isRuleDraftDirty({ ...base, transformExpr: 'value * 3' })).toBe(true)
  })
})
