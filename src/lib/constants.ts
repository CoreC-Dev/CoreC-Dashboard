export const DataTypeMap = {
  0: 'bool',
  1: 'int8',
  2: 'int16',
  3: 'int32',
  4: 'int64',
  5: 'uint8',
  6: 'uint16',
  7: 'uint32',
  8: 'uint64',
  9: 'float32',
  10: 'float64',
  11: 'string',
  12: 'bytes',
} as const

export type DataTypeString =
  | 'bool'
  | 'int8'
  | 'int16'
  | 'int32'
  | 'int64'
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'uint64'
  | 'float32'
  | 'float64'
  | 'string'
  | 'bytes'

export const Quality = {
  Good: 0,
  Bad: 1,
  Uncertain: 2,
} as const

export const QualityLabel: Record<number, { text: string; color: string }> = {
  [Quality.Good]: {
    text: 'Good',
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
  },
  [Quality.Bad]: { text: 'Bad', color: 'text-rose-500 bg-rose-500/10 border-rose-500/30' },
  [Quality.Uncertain]: {
    text: 'Uncertain',
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
  },
}

export const ConnState = {
  Disconnected: 0,
  Connecting: 1,
  Connected: 2,
  Error: 3,
} as const

export const ConnStateLabel: Record<
  number,
  { text: string; dotColor: string; badgeColor: string }
> = {
  [ConnState.Disconnected]: {
    text: 'Disconnected',
    dotColor: 'bg-zinc-500',
    badgeColor: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
  },
  [ConnState.Connecting]: {
    text: 'Connecting',
    dotColor: 'bg-amber-400 animate-pulse',
    badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  [ConnState.Connected]: {
    text: 'Connected',
    dotColor: 'bg-emerald-400 glow-success',
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  },
  [ConnState.Error]: {
    text: 'Error',
    dotColor: 'bg-rose-500 glow-danger',
    badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  },
}

export const DriverProtocols = [
  { value: 'modbus-tcp', label: 'Modbus TCP' },
  { value: 'modbus-rtu', label: 'Modbus RTU (Serial)' },
  { value: 'modbus-rtuovertcp', label: 'Modbus RTU over TCP' },
  { value: 'modbus-udp', label: 'Modbus UDP' },
  { value: 'modbus-rtuoverudp', label: 'Modbus RTU over UDP' },
  { value: 'modbus-tls', label: 'Modbus TLS (mTLS)' },
  { value: 's7', label: 'Siemens S7 (200..1500)' },
  { value: 'opcua', label: 'OPC UA Client' },
]

export const TransportProtocols = [
  { value: 'mqtt', label: 'MQTT Publisher' },
  { value: 'http', label: 'HTTP Push' },
]

export const DEFAULT_COREC_URL = 'http://127.0.0.1:9090'
