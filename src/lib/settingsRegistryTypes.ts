/**
 * Settings Field Metadata — Shared Types & Fragments
 *
 * (Split from settingsRegistry.ts — TD-ARCH-013.)
 */

// ─── Field descriptor types ──────────────────────────────────────────
export type FieldType =
  | 'text' // free-form string (host, path, endpoint, expression)
  | 'number' // integer or float input
  | 'duration' // Go duration string ("30s", "500ms") — text input with validation
  | 'boolean' // checkbox / switch
  | 'enum' // single-select from a fixed list of strings
  | 'select' // single-select from a dynamic list (e.g. transport names)
  | 'password' // text input with masked display

export interface FieldGroup {
  /** Group label shown as a section header (i18n key or literal). */
  label: string
  /** Whether the group is collapsed by default (advanced fields). */
  advanced?: boolean
}

export interface SettingsField {
  /** Exact YAML key as written in config (kebab-case). */
  key: string
  /** Human-readable label (i18n key or literal). */
  label: string
  /** Input control type. */
  type: FieldType
  /** Whether the driver/transport Init() requires this field. */
  required?: boolean
  /** Default value applied when the field is omitted (server-side default). */
  default?: unknown
  /** For enum: the fixed list of allowed values. */
  options?: readonly string[]
  /** For select: the source of dynamic options (e.g. 'transports' for fallback). */
  optionsSource?: 'transports'
  /** Help text shown under the field (i18n key or literal). */
  help?: string
  /** Placeholder text for the input. */
  placeholder?: string
  /** Min/max for number fields. */
  min?: number
  max?: number
}

export interface TypeFieldRegistry {
  /** Ordered list of field groups, each containing its fields. */
  groups: Array<FieldGroup & { fields: SettingsField[] }>
}

// ─── Reusable field group fragments ──────────────────────────────────
export const RECONNECT_GROUP = {
  label: 'settings.reconnect',
  advanced: true,
  fields: [
    {
      key: 'reconnect-interval',
      label: 'settings.reconnectInterval',
      type: 'duration' as const,
      default: '2s',
      help: 'settings.reconnectIntervalHelp',
    },
    {
      key: 'reconnect-max-interval',
      label: 'settings.reconnectMaxInterval',
      type: 'duration' as const,
      default: '30s',
      help: 'settings.reconnectMaxIntervalHelp',
    },
    {
      key: 'max-reconnect-failures',
      label: 'settings.maxReconnectFailures',
      type: 'number' as const,
      default: 20,
      min: 0,
      help: 'settings.maxReconnectFailuresHelp',
    },
  ] satisfies SettingsField[],
}

// ─── Reusable modbus TCP-family connection fields ───────────────────
// host/port/slave-id/timeout repeated verbatim across modbus-tcp,
// modbus-rtuovertcp, modbus-udp, modbus-rtuoverudp, and modbus-tls. Only the
// host placeholder varies between entries; modbus-tls additionally overrides
// the port default/help (802 / settings.portTlsHelp). modbus-tcp appends a
// `retry` field after the connection group; modbus-tls appends an mTLS group.
export const MODBUS_CONNECTION_FIELDS = (
  hostPlaceholder: string,
  port: { default?: number; help?: string } = {},
): SettingsField[] => [
  {
    key: 'host',
    label: 'settings.host',
    type: 'text',
    required: true,
    placeholder: hostPlaceholder,
    help: 'settings.hostHelp',
  },
  {
    key: 'port',
    label: 'settings.port',
    type: 'number',
    default: port.default ?? 502,
    min: 1,
    max: 65535,
    help: port.help ?? 'settings.portHelp',
  },
  {
    key: 'slave-id',
    label: 'settings.slaveId',
    type: 'number',
    default: 1,
    min: 0,
    max: 247,
    help: 'settings.slaveIdHelp',
  },
  {
    key: 'timeout',
    label: 'settings.timeout',
    type: 'duration',
    default: '3s',
    help: 'settings.timeoutHelp',
  },
]
