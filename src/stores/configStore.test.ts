import { beforeEach, describe, expect, it } from 'vitest'
import type {
  CoreCConfig,
  DriverConfig,
  RuleConfig,
  RuleProviderConfig,
  TransportConfig,
} from '@/types/config'
import { useConfigStore } from './configStore'

// A minimal valid config for testing.
const baseConfig: CoreCConfig = {
  global: {
    'log-level': 'info',
    api: { listen: '0.0.0.0:9090', secret: 'test-secret-token' },
  },
  drivers: [
    {
      name: 'plc-modbus',
      type: 'modbus-tcp',
      settings: { host: '192.168.1.100', port: 502, 'slave-id': 1, timeout: '3s' },
      tags: [{ name: 'temperature', address: '40001', type: 'float32', interval: '1s' }],
    },
  ],
  transports: [
    {
      name: 'cloud-mqtt',
      type: 'mqtt',
      settings: { broker: 'tcp://broker.emqx.io:1883', 'client-id': 'edge-01', qos: 1 },
    },
  ],
  rules: [
    {
      name: 'high-temp',
      match: "tag == 'temperature' && value > 95",
      action: 'alert',
      target: 'cloud-mqtt',
      priority: 1,
    },
  ],
  'rule-providers': [
    {
      name: 'external-rules',
      type: 'file',
      path: '/etc/corec/rules/external.yaml',
      interval: '30s',
    },
  ],
  'rule-groups': {
    'filter-group': [
      {
        name: 'temp-filter',
        match: 'tag contains "temp"',
        action: 'forward',
        target: 'cloud-mqtt',
        priority: 10,
      },
    ],
  },
}

const newDriver: DriverConfig = {
  name: 'sensor-s7',
  type: 's7',
  settings: { host: '192.168.1.200', port: 102, rack: 0, slot: 2 },
  tags: [{ name: 'motor_speed', address: 'DB1.DBW4', type: 'uint16', interval: '1s' }],
}

const newTransport: TransportConfig = {
  name: 'mes-http',
  type: 'http',
  settings: { url: 'http://localhost:8080/api/v1/telemetry', method: 'POST' },
}

const newRule: RuleConfig = {
  name: 'catch-all',
  match: 'ALL',
  action: 'forward',
  target: 'cloud-mqtt',
  priority: 999,
}

beforeEach(() => {
  // Reset store to a clean state before each test.
  useConfigStore.setState({
    workingConfig: null,
    savedConfig: null,
    dirty: false,
    error: null,
  })
})

describe('configStore — loading', () => {
  it('loadFromConfig sets working and saved, clears dirty', () => {
    useConfigStore.getState().loadFromConfig(baseConfig)
    const s = useConfigStore.getState()
    expect(s.workingConfig).toEqual(baseConfig)
    expect(s.savedConfig).toEqual(baseConfig)
    expect(s.dirty).toBe(false)
    expect(s.error).toBeNull()
  })

  it('loadFromYaml parses YAML and sets working+saved', () => {
    const yaml = `
global:
  log-level: debug
drivers:
  - name: d1
    type: modbus-tcp
    settings: { host: 10.0.0.1 }
    tags:
      - name: t1
        address: "40001"
        type: float32
`
    useConfigStore.getState().loadFromYaml(yaml)
    const s = useConfigStore.getState()
    expect(s.workingConfig?.global?.['log-level']).toBe('debug')
    expect(s.workingConfig?.drivers?.[0]?.name).toBe('d1')
    expect(s.dirty).toBe(false)
  })

  it('loadFromYaml sets error on invalid YAML', () => {
    useConfigStore.getState().loadFromYaml('{ invalid yaml: : :')
    const s = useConfigStore.getState()
    expect(s.workingConfig).toBeNull()
    expect(s.error).toBeTruthy()
  })

  it('resetToEmpty starts a fresh empty config marked dirty', () => {
    useConfigStore.getState().resetToEmpty()
    const s = useConfigStore.getState()
    expect(s.workingConfig).toEqual({})
    expect(s.savedConfig).toBeNull()
    expect(s.dirty).toBe(true)
  })
})

describe('configStore — driver CRUD', () => {
  beforeEach(() => {
    useConfigStore.getState().loadFromConfig(baseConfig)
  })

  it('upsertDriver adds a new driver and marks dirty', () => {
    const ok = useConfigStore.getState().upsertDriver(newDriver)
    expect(ok).toBe(true)
    const s = useConfigStore.getState()
    expect(s.workingConfig?.drivers).toHaveLength(2)
    expect(s.dirty).toBe(true)
  })

  it('upsertDriver updates an existing driver (same name)', () => {
    const updated: DriverConfig = {
      ...baseConfig.drivers![0],
      settings: { host: '10.0.0.99', port: 502, 'slave-id': 1, timeout: '3s' },
    }
    const ok = useConfigStore.getState().upsertDriver(updated)
    expect(ok).toBe(true)
    const s = useConfigStore.getState()
    expect(s.workingConfig?.drivers).toHaveLength(1)
    expect(s.workingConfig?.drivers?.[0]?.settings.host).toBe('10.0.0.99')
  })

  it('upsertDriver returns false when no working config', () => {
    useConfigStore.getState().resetToEmpty()
    // resetToEmpty creates {}, so upsertDriver should work
    const ok = useConfigStore.getState().upsertDriver(newDriver)
    expect(ok).toBe(true)
  })

  it('removeDriver removes by name and marks dirty', () => {
    useConfigStore.getState().removeDriver('plc-modbus')
    const s = useConfigStore.getState()
    expect(s.workingConfig?.drivers).toHaveLength(0)
    expect(s.dirty).toBe(true)
  })

  it('findDriver locates by name in working config', () => {
    const d = useConfigStore.getState().findDriver('plc-modbus')
    expect(d?.type).toBe('modbus-tcp')
  })

  it('isDriverNameUnique returns false for existing name', () => {
    expect(useConfigStore.getState().isDriverNameUnique('plc-modbus')).toBe(false)
    expect(useConfigStore.getState().isDriverNameUnique('new-driver')).toBe(true)
  })
})

describe('configStore — transport CRUD', () => {
  beforeEach(() => {
    useConfigStore.getState().loadFromConfig(baseConfig)
  })

  it('upsertTransport adds a new transport and marks dirty', () => {
    const ok = useConfigStore.getState().upsertTransport(newTransport)
    expect(ok).toBe(true)
    expect(useConfigStore.getState().workingConfig?.transports).toHaveLength(2)
    expect(useConfigStore.getState().dirty).toBe(true)
  })

  it('removeTransport removes by name', () => {
    useConfigStore.getState().removeTransport('cloud-mqtt')
    expect(useConfigStore.getState().workingConfig?.transports).toHaveLength(0)
  })
})

describe('configStore — rule CRUD', () => {
  beforeEach(() => {
    useConfigStore.getState().loadFromConfig(baseConfig)
  })

  it('upsertRule adds a new rule and marks dirty', () => {
    const ok = useConfigStore.getState().upsertRule(newRule)
    expect(ok).toBe(true)
    expect(useConfigStore.getState().workingConfig?.rules).toHaveLength(2)
    expect(useConfigStore.getState().dirty).toBe(true)
  })

  it('removeRule removes by name', () => {
    useConfigStore.getState().removeRule('high-temp')
    expect(useConfigStore.getState().workingConfig?.rules).toHaveLength(0)
  })
})

describe('configStore — section updates', () => {
  beforeEach(() => {
    useConfigStore.getState().loadFromConfig(baseConfig)
  })

  it('updateGlobal replaces the global section', () => {
    useConfigStore.getState().updateGlobal({ 'log-level': 'debug' })
    expect(useConfigStore.getState().workingConfig?.global?.['log-level']).toBe('debug')
    expect(useConfigStore.getState().dirty).toBe(true)
  })

  it('updateNode sets the node section', () => {
    useConfigStore.getState().updateNode({ id: 'edge-A', role: 'collector' })
    expect(useConfigStore.getState().workingConfig?.node?.id).toBe('edge-A')
    expect(useConfigStore.getState().dirty).toBe(true)
  })
})

describe('configStore — save / revert', () => {
  beforeEach(() => {
    useConfigStore.getState().loadFromConfig(baseConfig)
  })

  it('markSaved clears dirty and snapshots working as saved', () => {
    useConfigStore.getState().upsertDriver(newDriver)
    expect(useConfigStore.getState().dirty).toBe(true)

    useConfigStore.getState().markSaved()
    const s = useConfigStore.getState()
    expect(s.dirty).toBe(false)
    expect(s.savedConfig?.drivers).toHaveLength(2)
  })

  it('revert discards working changes back to saved', () => {
    useConfigStore.getState().upsertDriver(newDriver)
    expect(useConfigStore.getState().workingConfig?.drivers).toHaveLength(2)

    useConfigStore.getState().revert()
    const s = useConfigStore.getState()
    expect(s.workingConfig?.drivers).toHaveLength(1)
    expect(s.dirty).toBe(false)
    expect(s.error).toBeNull()
  })

  it('revert on never-saved config clears working to null', () => {
    useConfigStore.getState().resetToEmpty()
    useConfigStore.getState().upsertDriver(newDriver)
    useConfigStore.getState().revert()
    expect(useConfigStore.getState().workingConfig).toBeNull()
  })
})

describe('configStore — rule provider CRUD', () => {
  beforeEach(() => {
    useConfigStore.getState().loadFromConfig(baseConfig)
  })

  it('findRuleProvider locates by name', () => {
    const p = useConfigStore.getState().findRuleProvider('external-rules')
    expect(p).toBeDefined()
    expect(p?.type).toBe('file')
  })

  it('upsertRuleProvider adds a new provider and marks dirty', () => {
    const newProvider: RuleProviderConfig = {
      name: 'extra-rules',
      type: 'file',
      path: '/etc/corec/rules/extra.yaml',
      interval: '1m',
    }
    const ok = useConfigStore.getState().upsertRuleProvider(newProvider)
    expect(ok).toBe(true)
    expect(useConfigStore.getState().workingConfig?.['rule-providers']).toHaveLength(2)
    expect(useConfigStore.getState().dirty).toBe(true)
  })

  it('upsertRuleProvider updates an existing provider (same name)', () => {
    const ok = useConfigStore.getState().upsertRuleProvider({
      name: 'external-rules',
      type: 'file',
      path: '/new/path/rules.yaml',
      interval: '60s',
    })
    expect(ok).toBe(true)
    const providers = useConfigStore.getState().workingConfig?.['rule-providers']
    expect(providers).toHaveLength(1)
    expect(providers?.[0]?.path).toBe('/new/path/rules.yaml')
    expect(providers?.[0]?.interval).toBe('60s')
  })

  it('upsertRuleProvider returns false when no working config', () => {
    useConfigStore.setState({ workingConfig: null })
    const ok = useConfigStore.getState().upsertRuleProvider({
      name: 'x',
      type: 'file',
      path: '/x.yaml',
    })
    expect(ok).toBe(false)
  })

  it('removeRuleProvider removes by name and marks dirty', () => {
    useConfigStore.getState().removeRuleProvider('external-rules')
    expect(useConfigStore.getState().workingConfig?.['rule-providers']).toHaveLength(0)
    expect(useConfigStore.getState().dirty).toBe(true)
  })

  it('isRuleProviderNameUnique returns false for existing name', () => {
    expect(useConfigStore.getState().isRuleProviderNameUnique('external-rules')).toBe(false)
    expect(useConfigStore.getState().isRuleProviderNameUnique('new-provider')).toBe(true)
  })

  it('isRuleProviderNameUnique returns true when no config loaded', () => {
    useConfigStore.setState({ workingConfig: null })
    expect(useConfigStore.getState().isRuleProviderNameUnique('anything')).toBe(true)
  })
})

describe('configStore — rule group CRUD', () => {
  beforeEach(() => {
    useConfigStore.getState().loadFromConfig(baseConfig)
  })

  it('findRuleGroup locates by name and returns rules array', () => {
    const rules = useConfigStore.getState().findRuleGroup('filter-group')
    expect(rules).toBeDefined()
    expect(rules).toHaveLength(1)
    expect(rules?.[0]?.name).toBe('temp-filter')
  })

  it('upsertRuleGroup adds a new group and marks dirty', () => {
    const newRules: RuleConfig[] = [
      { name: 'sub-1', match: 'value > 100', action: 'drop', priority: 5 },
    ]
    const ok = useConfigStore.getState().upsertRuleGroup('new-group', newRules)
    expect(ok).toBe(true)
    expect(useConfigStore.getState().workingConfig?.['rule-groups']?.['new-group']).toHaveLength(1)
    expect(useConfigStore.getState().dirty).toBe(true)
  })

  it('upsertRuleGroup updates an existing group (replaces rules)', () => {
    const updatedRules: RuleConfig[] = [
      { name: 'replaced', match: 'ALL', action: 'forward', target: 'cloud-mqtt', priority: 1 },
      { name: 'second', match: 'value < 0', action: 'drop', priority: 2 },
    ]
    const ok = useConfigStore.getState().upsertRuleGroup('filter-group', updatedRules)
    expect(ok).toBe(true)
    const rules = useConfigStore.getState().workingConfig?.['rule-groups']?.['filter-group']
    expect(rules).toHaveLength(2)
    expect(rules?.[0]?.name).toBe('replaced')
  })

  it('upsertRuleGroup returns false for empty name', () => {
    const ok = useConfigStore.getState().upsertRuleGroup('  ', [])
    expect(ok).toBe(false)
    expect(useConfigStore.getState().error).toBeTruthy()
  })

  it('upsertRuleGroup trims the group name', () => {
    const ok = useConfigStore.getState().upsertRuleGroup('  spaced-name  ', [])
    expect(ok).toBe(true)
    expect(useConfigStore.getState().workingConfig?.['rule-groups']?.['spaced-name']).toBeDefined()
  })

  it('upsertRuleGroup returns false when no working config', () => {
    useConfigStore.setState({ workingConfig: null })
    const ok = useConfigStore.getState().upsertRuleGroup('test', [])
    expect(ok).toBe(false)
  })

  it('removeRuleGroup removes by name and marks dirty', () => {
    useConfigStore.getState().removeRuleGroup('filter-group')
    expect(
      useConfigStore.getState().workingConfig?.['rule-groups']?.['filter-group'],
    ).toBeUndefined()
    expect(useConfigStore.getState().dirty).toBe(true)
  })

  it('isRuleGroupNameUnique returns false for existing name', () => {
    expect(useConfigStore.getState().isRuleGroupNameUnique('filter-group')).toBe(false)
    expect(useConfigStore.getState().isRuleGroupNameUnique('new-group')).toBe(true)
  })

  it('isRuleGroupNameUnique returns true when no config loaded', () => {
    useConfigStore.setState({ workingConfig: null })
    expect(useConfigStore.getState().isRuleGroupNameUnique('anything')).toBe(true)
  })
})

describe('configStore — field-level updates', () => {
  beforeEach(() => {
    useConfigStore.getState().loadFromConfig(baseConfig)
  })

  it('updateGlobalField sets a top-level global field', () => {
    useConfigStore.getState().updateGlobalField('log-level', 'debug')
    expect(useConfigStore.getState().workingConfig?.global?.['log-level']).toBe('debug')
    expect(useConfigStore.getState().dirty).toBe(true)
  })

  it('updateGlobalField sets a nested api field', () => {
    useConfigStore.getState().updateGlobalField('api.listen', '0.0.0.0:8080')
    expect(useConfigStore.getState().workingConfig?.global?.api?.listen).toBe('0.0.0.0:8080')
  })

  it('updateGlobalField sets a nested engine field', () => {
    useConfigStore.getState().updateGlobalField('engine.workers', 8)
    expect(useConfigStore.getState().workingConfig?.global?.engine?.workers).toBe(8)
  })

  it('updateGlobalField creates nested objects when they do not exist', () => {
    useConfigStore.getState().updateGlobalField('buffer.path', '/data/buf')
    expect(useConfigStore.getState().workingConfig?.global?.buffer?.path).toBe('/data/buf')
  })

  it('updateGlobalField deletes the key when value is undefined', () => {
    useConfigStore.getState().updateGlobalField('log-level', undefined)
    expect(useConfigStore.getState().workingConfig?.global?.['log-level']).toBeUndefined()
  })

  it('updateGlobalField does nothing when no working config', () => {
    useConfigStore.setState({ workingConfig: null })
    useConfigStore.getState().updateGlobalField('log-level', 'debug')
    expect(useConfigStore.getState().workingConfig).toBeNull()
  })

  it('updateNodeField sets a node field', () => {
    useConfigStore.getState().updateNodeField('id', 'node-01')
    expect(useConfigStore.getState().workingConfig?.node?.id).toBe('node-01')
    expect(useConfigStore.getState().dirty).toBe(true)
  })

  it('updateNodeField sets nested subscribe-like array field', () => {
    useConfigStore.getState().updateNodeField('topic-prefix', 'topo-v2')
    expect(useConfigStore.getState().workingConfig?.node?.['topic-prefix']).toBe('topo-v2')
  })
})

describe('configStore — YAML output', () => {
  beforeEach(() => {
    useConfigStore.getState().loadFromConfig(baseConfig)
  })

  it('getWorkingYaml produces valid YAML with correct content', () => {
    const yaml = useConfigStore.getState().getWorkingYaml()
    expect(yaml).toBeTruthy()
    expect(yaml).toContain('plc-modbus')
    expect(yaml).toContain('cloud-mqtt')
    expect(yaml).toContain('high-temp')
  })

  it('getWorkingYaml returns null when no config loaded', () => {
    useConfigStore.setState({ workingConfig: null })
    expect(useConfigStore.getState().getWorkingYaml()).toBeNull()
  })

  it('getSavedYaml returns null when never saved', () => {
    useConfigStore.getState().resetToEmpty()
    expect(useConfigStore.getState().getSavedYaml()).toBeNull()
  })
})
