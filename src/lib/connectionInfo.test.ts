import { describe, expect, it } from 'vitest'
import {
  extractDriverYaml,
  extractTransportYaml,
  getDriverConnectionFields,
  getDriverConnectionSummary,
  getTransportConnectionFields,
  getTransportConnectionSummary,
} from '@/lib/connectionInfo'
import type { CoreCConfig } from '@/types/config'

const config: CoreCConfig = {
  drivers: [
    {
      name: 'plc1',
      type: 'modbus-tcp',
      settings: { host: '192.168.1.5', port: 502, 'slave-id': 1, timeout: '5s', retry: 3 },
      tags: [],
    },
    {
      name: 'rtu1',
      type: 'modbus-rtu',
      settings: {
        'serial-device': '/dev/ttyS0',
        'baud-rate': 9600,
        parity: 'none',
        'slave-id': 2,
      },
      tags: [],
    },
    {
      name: 's7_1',
      type: 's7',
      settings: { host: '10.0.0.1', port: 102, rack: 0, slot: 1 },
      tags: [],
    },
    {
      name: 'opc1',
      type: 'opcua',
      settings: { endpoint: 'opc.tcp://localhost:4840', mode: 'None' },
      tags: [],
    },
  ],
  transports: [
    {
      name: 'mqtt1',
      type: 'mqtt',
      settings: { broker: 'tcp://broker:1883', 'client-id': 'c1', qos: 1 },
    },
  ],
}

describe('getDriverConnectionFields', () => {
  it('modbus-tcp: host (primary) + port + slave-id + timeout + retry', () => {
    const fields = getDriverConnectionFields(config, 'plc1')
    expect(fields[0]).toEqual({ label: 'Host', value: '192.168.1.5', primary: true })
    expect(fields[1]).toEqual({ label: 'Port', value: '502' })
    expect(fields.some((f) => f.label === 'Slave ID' && f.value === '1')).toBe(true)
  })

  it('modbus-rtu: serial-device (primary) + baud + parity', () => {
    const fields = getDriverConnectionFields(config, 'rtu1')
    expect(fields[0]).toEqual({ label: 'Serial Device', value: '/dev/ttyS0', primary: true })
    expect(fields.some((f) => f.label === 'Baud Rate' && f.value === '9600')).toBe(true)
  })

  it('s7: host (primary) + port + rack + slot', () => {
    const fields = getDriverConnectionFields(config, 's7_1')
    expect(fields[0]).toEqual({ label: 'Host', value: '10.0.0.1', primary: true })
    expect(fields.some((f) => f.label === 'Rack' && f.value === '0')).toBe(true)
  })

  it('opcua: endpoint (primary) + mode', () => {
    const fields = getDriverConnectionFields(config, 'opc1')
    expect(fields[0]).toEqual({
      label: 'Endpoint',
      value: 'opc.tcp://localhost:4840',
      primary: true,
    })
    expect(fields.some((f) => f.label === 'Mode' && f.value === 'None')).toBe(true)
  })

  it('returns [] for null config or missing driver', () => {
    expect(getDriverConnectionFields(null, 'plc1')).toEqual([])
    expect(getDriverConnectionFields(config, 'nope')).toEqual([])
  })

  it('tags count and tags-file are appended', () => {
    const cfg: CoreCConfig = {
      drivers: [
        {
          name: 'd',
          type: 'modbus-tcp',
          settings: { host: 'h' },
          tags: [{ name: 't1', address: '1', type: 'int16' }],
          'tags-file': 'tags.csv',
        },
      ],
    }
    const fields = getDriverConnectionFields(cfg, 'd')
    expect(fields.some((f) => f.label === 'Tags' && f.value === '1 configured')).toBe(true)
    expect(fields.some((f) => f.label === 'Tags File' && f.value === 'tags.csv')).toBe(true)
  })
})

describe('getDriverConnectionSummary', () => {
  it('joins primary field values with " · "', () => {
    expect(getDriverConnectionSummary(config, 'plc1')).toBe('192.168.1.5')
  })

  it('returns "" when no primary fields', () => {
    expect(getDriverConnectionSummary(null, 'x')).toBe('')
  })
})

describe('getTransportConnectionFields', () => {
  it('mqtt: broker (primary) + client-id + qos', () => {
    const fields = getTransportConnectionFields(config, 'mqtt1')
    expect(fields[0]).toEqual({ label: 'Broker', value: 'tcp://broker:1883', primary: true })
    expect(fields.some((f) => f.label === 'Client ID' && f.value === 'c1')).toBe(true)
    expect(fields.some((f) => f.label === 'QoS' && f.value === '1')).toBe(true)
  })

  it('returns [] for null config or missing transport', () => {
    expect(getTransportConnectionFields(null, 'x')).toEqual([])
    expect(getTransportConnectionFields(config, 'nope')).toEqual([])
  })
})

describe('getTransportConnectionSummary', () => {
  it('joins primary field values', () => {
    expect(getTransportConnectionSummary(config, 'mqtt1')).toBe('tcp://broker:1883')
  })
})

describe('extractDriverYaml / extractTransportYaml', () => {
  const rawYaml = [
    'drivers:',
    '- name: plc1',
    '  type: modbus-tcp',
    '  settings:',
    '    host: 192.168.1.5',
    '    port: 502',
    'transports:',
    '- name: mqtt1',
    '  type: mqtt',
    '  settings:',
    '    broker: tcp://broker:1883',
    '',
  ].join('\n')

  it('extracts a driver snippet by name', () => {
    const snippet = extractDriverYaml(rawYaml, 'plc1')
    expect(snippet).toContain('name: plc1')
    expect(snippet).toContain('type: modbus-tcp')
    expect(snippet).toContain('host: 192.168.1.5')
    // Should NOT include transport lines.
    expect(snippet).not.toContain('mqtt')
  })

  it('extracts a transport snippet by name', () => {
    const snippet = extractTransportYaml(rawYaml, 'mqtt1')
    expect(snippet).toContain('name: mqtt1')
    expect(snippet).toContain('broker: tcp://broker:1883')
    expect(snippet).not.toContain('modbus')
  })

  it('returns "" for a missing entity', () => {
    expect(extractDriverYaml(rawYaml, 'nope')).toBe('')
    expect(extractTransportYaml(rawYaml, 'nope')).toBe('')
  })
})
