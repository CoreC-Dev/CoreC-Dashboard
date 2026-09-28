/**
 * Configuration templates — pre-built CoreC config presets for common IIoT scenarios.
 *
 * Each template provides a complete, valid CoreC YAML config that users can
 * load as a starting point, then customize via the Dashboard's structured editors.
 * Templates are designed to be minimal but functional: they include the essential
 * entities (driver + transport + rule) with sensible defaults.
 *
 * Templates are pure data — no side effects. The ConfigCenterPage loads a
 * template into the working config via configStore.loadFromYaml().
 */

export interface ConfigTemplate {
  /** Unique template ID (kebab-case). */
  id: string
  /** Human-readable name. */
  name: string
  /** One-line description of the use case. */
  description: string
  /** Category for grouping in the UI. */
  category: 'industrial' | 'iot' | 'relay' | 'blank'
  /** Icon name (lucide-react). */
  icon: string
  /** Complete CoreC YAML config string. */
  yaml: string
}

export const CONFIG_TEMPLATES: ConfigTemplate[] = [
  {
    id: 'modbus-mqtt',
    name: 'Modbus TCP → MQTT Cloud',
    description: 'Read holding registers from a Modbus TCP PLC and forward to an MQTT broker',
    category: 'industrial',
    icon: 'Factory',
    yaml: `node:
  id: node-01
  role: collector

global:
  log-level: info
  log-format: json
  api:
    listen: ":8080"
    secret: "change-me-please"
  engine:
    on-bad-quality: mark-and-publish
    default-tag-interval: 1s

drivers:
  - name: plc-modbus
    type: modbus-tcp
    settings:
      host: "192.168.1.100"
      port: 502
      timeout: 5s
    tags:
      - name: temperature
        address: "40001"
        type: float32
        interval: 1s
      - name: pressure
        address: "40003"
        type: float32
        interval: 1s
      - name: motor_status
        address: "00001"
        type: bool
        interval: 500ms

transports:
  - name: cloud-mqtt
    type: mqtt
    settings:
      broker: "tcp://broker.example.com:1883"
      client-id: "corec-node-01"
      topic: "corec/data"
      qos: 1
    batch-size: 100
    flush-interval: 5s

rules:
  - name: forward-all
    match: ALL
    action: forward
    target: cloud-mqtt
    priority: 100
`,
  },
  {
    id: 'opcua-http',
    name: 'OPC-UA → HTTP Webhook',
    description: 'Subscribe to OPC-UA server nodes and push data to an HTTP endpoint',
    category: 'industrial',
    icon: 'Network',
    yaml: `node:
  id: node-02
  role: collector

global:
  log-level: info
  log-format: json
  api:
    listen: ":8080"
    secret: "change-me-please"
  engine:
    on-bad-quality: drop

drivers:
  - name: opcua-server
    type: opcua
    settings:
      endpoint: "opc.tcp://192.168.1.200:4840"
      security-mode: none
      timeout: 10s
    tags:
      - name: production_count
        address: "ns=2;s=Plant.Production.Count"
        type: int32
        interval: 2s
      - name: temperature
        address: "ns=2;s=Plant.Temperature"
        type: float64
        interval: 1s

transports:
  - name: http-api
    type: http
    settings:
      url: "https://api.example.com/v1/data"
      method: POST
      headers:
        Content-Type: "application/json"
        Authorization: "Bearer your-token-here"
    batch-size: 50
    flush-interval: 10s

rules:
  - name: forward-all
    match: ALL
    action: forward
    target: http-api
    priority: 100
`,
  },
  {
    id: 's7-mqtt-transform',
    name: 'S7 PLC → MQTT with Transform',
    description: 'Read Siemens S7 PLC data, convert units, and forward to MQTT',
    category: 'industrial',
    icon: 'Cpu',
    yaml: `node:
  id: node-03
  role: collector

global:
  log-level: info
  log-format: json
  api:
    listen: ":8080"
    secret: "change-me-please"
  engine:
    on-bad-quality: mark-and-publish

drivers:
  - name: plc-s7
    type: s7
    settings:
      host: "192.168.1.50"
      port: 102
      rack: 0
      slot: 1
      timeout: 5s
    tags:
      - name: temp_celsius
        address: "DB1.DBD0"
        type: float32
        interval: 1s
      - name: pressure_bar
        address: "DB1.DBD4"
        type: float32
        interval: 1s

transports:
  - name: cloud-mqtt
    type: mqtt
    settings:
      broker: "tcp://broker.example.com:1883"
      client-id: "corec-node-03"
      topic: "corec/data"
      qos: 1
    batch-size: 100
    flush-interval: 5s

rules:
  - name: forward-all
    match: ALL
    action: forward
    target: cloud-mqtt
    priority: 100
  - name: convert-temp-fahrenheit
    match: "tag == 'temp_celsius'"
    action: transform
    transform:
      expression: "value * 1.8 + 32"
      tag-rename: "temp_fahrenheit"
    priority: 50
`,
  },
  {
    id: 'relay-node',
    name: 'Relay Node (Chained CoreC)',
    description: 'Pure relay node — receive data via MQTT and forward to multiple destinations',
    category: 'relay',
    icon: 'GitBranch',
    yaml: `node:
  id: relay-01
  role: relay
  subscribe:
    - "corec/data/+/+"

global:
  log-level: info
  log-format: json
  api:
    listen: ":8080"
    secret: "change-me-please"
  engine:
    on-bad-quality: publish

drivers: []

transports:
  - name: inbound-mqtt
    type: mqtt
    settings:
      broker: "tcp://upstream.example.com:1883"
      client-id: "corec-relay-01"
      data-topic: "corec/data/#"
      qos: 1
  - name: cloud-mqtt
    type: mqtt
    settings:
      broker: "tcp://cloud.example.com:1883"
      client-id: "corec-relay-01-out"
      topic: "corec/relay/data"
      qos: 1
    batch-size: 100
    flush-interval: 5s
  - name: http-archive
    type: http
    settings:
      url: "https://archive.example.com/v1/ingest"
      method: POST
      headers:
        Content-Type: "application/json"
    batch-size: 200
    flush-interval: 30s

rules:
  - name: mirror-to-both
    match: ALL
    action: mirror
    targets:
      - cloud-mqtt
      - http-archive
    priority: 100
`,
  },
  {
    id: 'mqtt-http-batch',
    name: 'MQTT + HTTP Dual Transport',
    description: 'Collect from MQTT and forward to both MQTT and HTTP with batching',
    category: 'iot',
    icon: 'Cloud',
    yaml: `node:
  id: node-04
  role: collector

global:
  log-level: info
  log-format: json
  api:
    listen: ":8080"
    secret: "change-me-please"
  engine:
    on-bad-quality: mark-and-publish
  buffer:
    enabled: true
    path: "/var/lib/corec/buffer"
    max-size: 10000

drivers:
  - name: modbus-rtu
    type: modbus-rtu
    settings:
      serial-device: "/dev/ttyUSB0"
      baud-rate: 9600
      data-bits: 8
      parity: none
      stop-bits: 1
      timeout: 3s
    tags:
      - name: flow_rate
        address: "40001"
        type: float32
        interval: 2s
      - name: totalizer
        address: "40003"
        type: float32
        interval: 5s

transports:
  - name: cloud-mqtt
    type: mqtt
    settings:
      broker: "tcp://broker.example.com:1883"
      client-id: "corec-node-04"
      topic: "corec/flow"
      qos: 1
    batch-size: 100
    flush-interval: 5s
    fallback: http-backup
  - name: http-backup
    type: http
    settings:
      url: "https://backup.example.com/v1/data"
      method: POST
      headers:
        Content-Type: "application/json"
    batch-size: 50
    flush-interval: 10s

rules:
  - name: forward-all
    match: ALL
    action: forward
    target: cloud-mqtt
    priority: 100
`,
  },
  {
    id: 'blank',
    name: 'Blank Configuration',
    description: 'Start from scratch with minimal structure',
    category: 'blank',
    icon: 'FilePlus',
    yaml: `node:
  id: new-node
  role: collector

global:
  log-level: info
  log-format: json
  api:
    listen: ":8080"
    secret: "change-me-please"

drivers: []

transports: []

rules: []
`,
  },
]

/**
 * Get templates filtered by category.
 */
export function getTemplatesByCategory(category: ConfigTemplate['category']): ConfigTemplate[] {
  return CONFIG_TEMPLATES.filter((t) => t.category === category)
}

/**
 * Get a template by ID.
 */
export function getTemplateById(id: string): ConfigTemplate | undefined {
  return CONFIG_TEMPLATES.find((t) => t.id === id)
}
