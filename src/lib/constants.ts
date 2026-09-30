import { DATA_TYPES, type DataType } from '@/types/config'

// Derived from the canonical DATA_TYPES list in @/types/config so the
// numeric code → string name mapping can never drift from the source list.
export const DataTypeMap: Readonly<Record<number, DataType>> = Object.fromEntries(
  DATA_TYPES.map((v, i) => [i, v] as const),
)

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

export const QualityLabel: Record<number, { key: string; color: string }> = {
  [Quality.Good]: {
    key: 'common.good',
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
  },
  [Quality.Bad]: { key: 'common.bad', color: 'text-rose-500 bg-rose-500/10 border-rose-500/30' },
  [Quality.Uncertain]: {
    key: 'common.uncertain',
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
  },
}

export const ConnState = {
  Disconnected: 0,
  Connecting: 1,
  Connected: 2,
  Error: 3,
} as const

export const ConnStateLabel: Record<number, { key: string; dotColor: string; badgeColor: string }> =
  {
    [ConnState.Disconnected]: {
      key: 'common.disconnected',
      dotColor: 'bg-zinc-500',
      badgeColor: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
    },
    [ConnState.Connecting]: {
      key: 'common.connecting',
      dotColor: 'bg-amber-400 animate-pulse',
      badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    },
    [ConnState.Connected]: {
      key: 'common.connected',
      dotColor: 'bg-emerald-400 glow-success',
      badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    },
    [ConnState.Error]: {
      key: 'common.error',
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
