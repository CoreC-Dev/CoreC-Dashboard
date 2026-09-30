/**
 * Connection info extraction utilities.
 *
 * CoreC's /drivers and /transports endpoints return only runtime status +
 * counters — NO connection parameters (broker, host, port, URL, etc.).
 * Those live in the full config YAML from GET /configs/raw.
 *
 * These helpers extract human-readable connection summaries from a parsed
 * CoreCConfig so detail pages and list cards can show them as read-only info.
 */
import type { CoreCConfig, DriverConfig, TransportConfig } from '@/types/config'

/** A single key-value pair for display in a connection info card. */
export interface ConnField {
  label: string
  value: string
  /** Whether this field is a primary identifier (e.g. broker URL, host:port) — shown prominently. */
  primary?: boolean
}

/** Extract connection fields for a driver by name from parsed config. */
export function getDriverConnectionFields(
  config: CoreCConfig | null,
  driverName: string,
): ConnField[] {
  if (!config?.drivers) return []
  const driver = config.drivers.find((d: DriverConfig) => d.name === driverName)
  if (!driver?.settings) return []

  const s = driver.settings as Record<string, unknown>
  const fields: ConnField[] = []

  switch (driver.type) {
    case 'modbus-tcp':
    case 'modbus-rtuovertcp':
    case 'modbus-udp':
    case 'modbus-rtuoverudp':
      if (s['host']) fields.push({ label: 'Host', value: String(s['host']), primary: true })
      if (s['port']) fields.push({ label: 'Port', value: String(s['port']) })
      if (s['slave-id'] !== undefined)
        fields.push({ label: 'Slave ID', value: String(s['slave-id']) })
      if (s['timeout']) fields.push({ label: 'Timeout', value: String(s['timeout']) })
      if (s['retry']) fields.push({ label: 'Retry', value: String(s['retry']) })
      break
    case 'modbus-rtu':
      if (s['serial-device'])
        fields.push({ label: 'Serial Device', value: String(s['serial-device']), primary: true })
      if (s['baud-rate']) fields.push({ label: 'Baud Rate', value: String(s['baud-rate']) })
      if (s['data-bits']) fields.push({ label: 'Data Bits', value: String(s['data-bits']) })
      if (s['parity']) fields.push({ label: 'Parity', value: String(s['parity']) })
      if (s['stop-bits']) fields.push({ label: 'Stop Bits', value: String(s['stop-bits']) })
      if (s['slave-id'] !== undefined)
        fields.push({ label: 'Slave ID', value: String(s['slave-id']) })
      break
    case 'modbus-tls':
      if (s['host']) fields.push({ label: 'Host', value: String(s['host']), primary: true })
      if (s['port']) fields.push({ label: 'Port', value: String(s['port']) })
      if (s['slave-id'] !== undefined)
        fields.push({ label: 'Slave ID', value: String(s['slave-id']) })
      if (s['cert-file']) fields.push({ label: 'Cert File', value: String(s['cert-file']) })
      if (s['key-file']) fields.push({ label: 'Key File', value: String(s['key-file']) })
      if (s['ca-file']) fields.push({ label: 'CA File', value: String(s['ca-file']) })
      break
    case 's7':
      if (s['host']) fields.push({ label: 'Host', value: String(s['host']), primary: true })
      if (s['port']) fields.push({ label: 'Port', value: String(s['port']) })
      if (s['rack'] !== undefined) fields.push({ label: 'Rack', value: String(s['rack']) })
      if (s['slot'] !== undefined) fields.push({ label: 'Slot', value: String(s['slot']) })
      break
    case 'opcua':
      if (s['endpoint'])
        fields.push({ label: 'Endpoint', value: String(s['endpoint']), primary: true })
      if (s['mode']) fields.push({ label: 'Mode', value: String(s['mode']) })
      if (s['security-policy'])
        fields.push({ label: 'Security Policy', value: String(s['security-policy']) })
      if (s['security-mode'])
        fields.push({ label: 'Security Mode', value: String(s['security-mode']) })
      if (s['username']) fields.push({ label: 'Username', value: String(s['username']) })
      break
    default:
      // Unknown type — show all settings as key-value
      for (const [k, v] of Object.entries(s)) {
        if (v !== undefined && v !== null && v !== '') {
          fields.push({ label: k, value: String(v) })
        }
      }
  }

  // Tags info
  if (driver.tags && driver.tags.length > 0) {
    fields.push({ label: 'Tags', value: `${driver.tags.length} configured` })
  }
  if (driver['tags-file']) {
    fields.push({ label: 'Tags File', value: String(driver['tags-file']) })
  }

  return fields
}

/** Extract connection fields for a transport by name from parsed config. */
export function getTransportConnectionFields(
  config: CoreCConfig | null,
  transportName: string,
): ConnField[] {
  if (!config?.transports) return []
  const transport = config.transports.find((t: TransportConfig) => t.name === transportName)
  if (!transport?.settings) return []

  const s = transport.settings as Record<string, unknown>
  const fields: ConnField[] = []

  switch (transport.type) {
    case 'mqtt':
      if (s['broker']) fields.push({ label: 'Broker', value: String(s['broker']), primary: true })
      if (s['client-id']) fields.push({ label: 'Client ID', value: String(s['client-id']) })
      if (s['qos'] !== undefined) fields.push({ label: 'QoS', value: String(s['qos']) })
      if (s['topic-template'] && s['topic-template'] !== 'unused') {
        fields.push({ label: 'Publish Topic', value: String(s['topic-template']) })
      }
      if (s['data-topic'] && s['data-topic'] !== 'unused') {
        fields.push({
          label: 'Subscribe Topic',
          value: String(s['data-topic']),
          primary: !fields.some((f) => f.primary),
        })
      }
      if (s['command-topic'] && s['command-topic'] !== 'unused') {
        fields.push({ label: 'Command Topic', value: String(s['command-topic']) })
      }
      if (s['retained'] !== undefined)
        fields.push({ label: 'Retained', value: String(s['retained']) })
      if (s['clean-session'] !== undefined)
        fields.push({ label: 'Clean Session', value: String(s['clean-session']) })
      if (s['keep-alive']) fields.push({ label: 'Keep Alive', value: String(s['keep-alive']) })
      if (s['username']) fields.push({ label: 'Username', value: String(s['username']) })
      if (s['parser'] && typeof s['parser'] === 'object') {
        const p = s['parser'] as Record<string, unknown>
        fields.push({ label: 'Parser', value: String(p['type'] ?? 'default') })
      }
      break
    case 'http':
      if (s['url']) {
        fields.push({ label: 'Publish URL', value: String(s['url']), primary: true })
      }
      if (s['method']) fields.push({ label: 'Method', value: String(s['method']) })
      if (s['webhook-addr']) {
        fields.push({
          label: 'Webhook Address',
          value: String(s['webhook-addr']),
          primary: !fields.some((f) => f.primary),
        })
      }
      if (s['webhook-path'])
        fields.push({ label: 'Webhook Path', value: String(s['webhook-path']) })
      if (s['timeout']) fields.push({ label: 'Timeout', value: String(s['timeout']) })
      if (s['headers'] && typeof s['headers'] === 'object') {
        const headers = s['headers'] as Record<string, unknown>
        const keys = Object.keys(headers)
        if (keys.length > 0) fields.push({ label: 'Headers', value: `${keys.length} configured` })
      }
      if (s['parser'] && typeof s['parser'] === 'object') {
        const p = s['parser'] as Record<string, unknown>
        fields.push({ label: 'Parser', value: String(p['type'] ?? 'default') })
      }
      break
    default:
      for (const [k, v] of Object.entries(s)) {
        if (v !== undefined && v !== null && v !== '' && v !== 'unused') {
          fields.push({ label: k, value: String(v) })
        }
      }
  }

  // Top-level transport fields
  if (transport['batch-size'] !== undefined)
    fields.push({ label: 'Batch Size', value: String(transport['batch-size']) })
  if (transport['flush-interval'])
    fields.push({ label: 'Flush Interval', value: String(transport['flush-interval']) })
  if (transport['retry-count'] !== undefined)
    fields.push({ label: 'Retry Count', value: String(transport['retry-count']) })
  if (transport['buffer-size'] !== undefined)
    fields.push({ label: 'Buffer Size', value: String(transport['buffer-size']) })
  if (transport['fallback'])
    fields.push({ label: 'Fallback', value: String(transport['fallback']) })

  return fields
}

/** Get a short one-line connection summary for list cards. */
export function getDriverConnectionSummary(config: CoreCConfig | null, driverName: string): string {
  const fields = getDriverConnectionFields(config, driverName)
  const primary = fields.find((f) => f.primary)
  if (primary) return primary.value
  return ''
}

/** Get a short one-line connection summary for transport list cards. */
export function getTransportConnectionSummary(
  config: CoreCConfig | null,
  transportName: string,
): string {
  const fields = getTransportConnectionFields(config, transportName)
  const primaries = fields.filter((f) => f.primary)
  if (primaries.length > 0) return primaries.map((f) => f.value).join(' · ')
  return ''
}

/** Extract a single driver's YAML snippet from the raw config YAML string. */
export function extractDriverYaml(rawYaml: string, driverName: string): string {
  // Simple extraction: find the driver block in the YAML
  const lines = rawYaml.split('\n')
  let inDrivers = false
  let inTargetDriver = false
  let indent = 0
  const result: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^drivers\s*:/.test(line)) {
      inDrivers = true
      continue
    }
    if (
      inDrivers &&
      /^transports\s*:|^rules\s*:|^rule-providers\s*:|^rule-groups\s*:|^global\s*:|^node\s*:/.test(
        line,
      )
    ) {
      inDrivers = false
      inTargetDriver = false
      continue
    }
    if (inDrivers && /^-\s+name:\s/.test(line)) {
      indent = line.indexOf('-')
      const name = line
        .match(/name:\s*(.+)/)?.[1]
        ?.trim()
        .replace(/^["']|["']$/g, '')
      inTargetDriver = name === driverName
      if (inTargetDriver) result.push(line)
      continue
    }
    if (inDrivers && inTargetDriver) {
      // Check if this line belongs to the current driver entry
      const lineIndent = line.search(/\S/)
      if (lineIndent <= indent && line.trim() && !line.trim().startsWith('#')) {
        inTargetDriver = false
        continue
      }
      result.push(line)
    }
  }
  return result.join('\n')
}

/** Extract a single transport's YAML snippet from the raw config YAML string. */
export function extractTransportYaml(rawYaml: string, transportName: string): string {
  const lines = rawYaml.split('\n')
  let inTransports = false
  let inTargetTransport = false
  let indent = 0
  const result: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^transports\s*:/.test(line)) {
      inTransports = true
      continue
    }
    if (
      inTransports &&
      /^rules\s*:|^rule-providers\s*:|^rule-groups\s*:|^global\s*:|^node\s*:|^drivers\s*:/.test(
        line,
      )
    ) {
      inTransports = false
      inTargetTransport = false
      continue
    }
    if (inTransports && /^-\s+name:\s/.test(line)) {
      indent = line.indexOf('-')
      const name = line
        .match(/name:\s*(.+)/)?.[1]
        ?.trim()
        .replace(/^["']|["']$/g, '')
      inTargetTransport = name === transportName
      if (inTargetTransport) result.push(line)
      continue
    }
    if (inTransports && inTargetTransport) {
      const lineIndent = line.search(/\S/)
      if (lineIndent <= indent && line.trim() && !line.trim().startsWith('#')) {
        inTargetTransport = false
        continue
      }
      result.push(line)
    }
  }
  return result.join('\n')
}
