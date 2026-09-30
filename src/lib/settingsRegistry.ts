/**
 * Settings Field Metadata Registry
 *
 * Declarative description of every known settings field for each driver and
 * transport type. Powers dynamic form rendering in the create/edit wizards
 * (CONFIGURATION_FEATURE_PLAN.md §6.2): instead of hand-writing a form per
 * protocol, the wizard reads this registry and renders the appropriate input
 * control (text, number, duration picker, enum select, checkbox) with the
 * correct required/optional marker, default value, and help text.
 *
 * Source of truth: config.example.yaml + driver/transport Init() required-field
 * checks (mirrored in configSchema.ts). When a new field is added to CoreC,
 * add it here and the wizard form picks it up automatically.
 *
 * Field "required" here means the driver/transport Init() will error without
 * it (hard fail at startup). "optional" means the server applies a default.
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
const RECONNECT_GROUP = {
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
const MODBUS_CONNECTION_FIELDS = (
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

// ─── Driver settings registries ──────────────────────────────────────
export const DRIVER_SETTINGS_REGISTRY: Record<string, TypeFieldRegistry> = {
  'modbus-tcp': {
    groups: [
      {
        label: 'settings.connection',
        fields: [
          ...MODBUS_CONNECTION_FIELDS('192.168.1.100'),
          {
            key: 'retry',
            label: 'settings.retry',
            type: 'number',
            default: 3,
            min: 0,
            help: 'settings.retryHelp',
          },
        ],
      },
      RECONNECT_GROUP,
    ],
  },

  'modbus-rtu': {
    groups: [
      {
        label: 'settings.serial',
        fields: [
          {
            key: 'serial-device',
            label: 'settings.serialDevice',
            type: 'text',
            required: true,
            placeholder: '/dev/ttyUSB0',
            help: 'settings.serialDeviceHelp',
          },
          {
            key: 'baud-rate',
            label: 'settings.baudRate',
            type: 'number',
            default: 9600,
            help: 'settings.baudRateHelp',
          },
          {
            key: 'data-bits',
            label: 'settings.dataBits',
            type: 'enum',
            default: 8,
            options: ['7', '8'],
            help: 'settings.dataBitsHelp',
          },
          {
            key: 'parity',
            label: 'settings.parity',
            type: 'enum',
            default: 'none',
            options: ['none', 'even', 'odd'],
            help: 'settings.parityHelp',
          },
          {
            key: 'stop-bits',
            label: 'settings.stopBits',
            type: 'enum',
            default: 1,
            options: ['1', '2'],
            help: 'settings.stopBitsHelp',
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
          {
            key: 'retry',
            label: 'settings.retry',
            type: 'number',
            default: 3,
            min: 0,
            help: 'settings.retryHelp',
          },
        ],
      },
      RECONNECT_GROUP,
    ],
  },

  'modbus-rtuovertcp': {
    groups: [
      {
        label: 'settings.connection',
        fields: [...MODBUS_CONNECTION_FIELDS('192.168.1.80')],
      },
      RECONNECT_GROUP,
    ],
  },

  'modbus-udp': {
    groups: [
      {
        label: 'settings.connection',
        fields: [...MODBUS_CONNECTION_FIELDS('192.168.1.90')],
      },
      RECONNECT_GROUP,
    ],
  },

  'modbus-rtuoverudp': {
    groups: [
      {
        label: 'settings.connection',
        fields: [...MODBUS_CONNECTION_FIELDS('192.168.1.91')],
      },
      RECONNECT_GROUP,
    ],
  },

  'modbus-tls': {
    groups: [
      {
        label: 'settings.connection',
        fields: [
          ...MODBUS_CONNECTION_FIELDS('192.168.1.100', {
            default: 802,
            help: 'settings.portTlsHelp',
          }),
        ],
      },
      {
        label: 'settings.mtls',
        fields: [
          {
            key: 'cert-file',
            label: 'settings.certFile',
            type: 'text',
            required: true,
            placeholder: '/etc/corec/certs/client.crt',
            help: 'settings.certFileHelp',
          },
          {
            key: 'key-file',
            label: 'settings.keyFile',
            type: 'text',
            required: true,
            placeholder: '/etc/corec/certs/client.key',
            help: 'settings.keyFileHelp',
          },
          {
            key: 'ca-file',
            label: 'settings.caFile',
            type: 'text',
            required: true,
            placeholder: '/etc/corec/certs/ca.crt',
            help: 'settings.caFileHelp',
          },
        ],
      },
      RECONNECT_GROUP,
    ],
  },

  s7: {
    groups: [
      {
        label: 'settings.connection',
        fields: [
          {
            key: 'host',
            label: 'settings.host',
            type: 'text',
            required: true,
            placeholder: '192.168.1.200',
            help: 'settings.hostHelp',
          },
          {
            key: 'port',
            label: 'settings.port',
            type: 'number',
            default: 102,
            min: 1,
            max: 65535,
            help: 'settings.portS7Help',
          },
          {
            key: 'rack',
            label: 'settings.rack',
            type: 'number',
            default: 0,
            min: 0,
            help: 'settings.rackHelp',
          },
          {
            key: 'slot',
            label: 'settings.slot',
            type: 'number',
            default: 2,
            min: 0,
            help: 'settings.slotHelp',
          },
          {
            key: 'timeout',
            label: 'settings.timeout',
            type: 'duration',
            default: '3s',
            help: 'settings.timeoutHelp',
          },
          {
            key: 'idle-timeout',
            label: 'settings.idleTimeout',
            type: 'duration',
            default: '60s',
            help: 'settings.idleTimeoutHelp',
          },
        ],
      },
      RECONNECT_GROUP,
    ],
  },

  opcua: {
    groups: [
      {
        label: 'settings.connection',
        fields: [
          {
            key: 'endpoint',
            label: 'settings.endpoint',
            type: 'text',
            required: true,
            placeholder: 'opc.tcp://192.168.1.50:4840',
            help: 'settings.endpointHelp',
          },
          {
            key: 'mode',
            label: 'settings.mode',
            type: 'enum',
            default: 'polling',
            options: ['polling', 'subscription'],
            help: 'settings.modeHelp',
          },
          {
            key: 'timeout',
            label: 'settings.timeout',
            type: 'duration',
            default: '5s',
            help: 'settings.timeoutHelp',
          },
        ],
      },
      {
        label: 'settings.security',
        advanced: true,
        fields: [
          {
            key: 'security-policy',
            label: 'settings.securityPolicy',
            type: 'enum',
            default: 'None',
            options: ['None', 'Basic256Sha256', 'Aes128Sha256RsaOaep', 'Aes256Sha256RsaPss'],
            help: 'settings.securityPolicyHelp',
          },
          {
            key: 'security-mode',
            label: 'settings.securityMode',
            type: 'enum',
            default: 'None',
            options: ['None', 'Sign', 'SignAndEncrypt'],
            help: 'settings.securityModeHelp',
          },
          {
            key: 'username',
            label: 'settings.username',
            type: 'text',
            help: 'settings.usernameHelp',
          },
          {
            key: 'password',
            label: 'settings.password',
            type: 'password',
            help: 'settings.passwordHelp',
          },
          {
            key: 'cert-file',
            label: 'settings.certFile',
            type: 'text',
            placeholder: '/etc/corec/opcua/client.crt',
            help: 'settings.certFileOpcuaHelp',
          },
          {
            key: 'key-file',
            label: 'settings.keyFile',
            type: 'text',
            placeholder: '/etc/corec/opcua/client.key',
            help: 'settings.keyFileOpcuaHelp',
          },
        ],
      },
      {
        label: 'settings.subscription',
        advanced: true,
        fields: [
          {
            key: 'subscription-interval',
            label: 'settings.subscriptionInterval',
            type: 'duration',
            default: '500ms',
            help: 'settings.subscriptionIntervalHelp',
          },
          {
            key: 'subscription-buffer',
            label: 'settings.subscriptionBuffer',
            type: 'number',
            default: 1024,
            min: 1,
            help: 'settings.subscriptionBufferHelp',
          },
          {
            key: 'max-batch-size',
            label: 'settings.maxBatchSize',
            type: 'number',
            default: 1000,
            min: 1,
            help: 'settings.maxBatchSizeHelp',
          },
        ],
      },
      RECONNECT_GROUP,
    ],
  },
}

// ─── Transport settings registries ───────────────────────────────────
export const TRANSPORT_SETTINGS_REGISTRY: Record<string, TypeFieldRegistry> = {
  mqtt: {
    groups: [
      {
        label: 'settings.broker',
        fields: [
          {
            key: 'broker',
            label: 'settings.brokerUrl',
            type: 'text',
            required: true,
            placeholder: 'tcp://broker.emqx.io:1883',
            help: 'settings.brokerUrlHelp',
          },
          {
            key: 'client-id',
            label: 'settings.clientId',
            type: 'text',
            required: true,
            placeholder: 'factory-edge-01',
            help: 'settings.clientIdHelp',
          },
          {
            key: 'username',
            label: 'settings.username',
            type: 'text',
            help: 'settings.usernameHelp',
          },
          {
            key: 'password',
            label: 'settings.password',
            type: 'password',
            help: 'settings.passwordHelp',
          },
          {
            key: 'qos',
            label: 'settings.qos',
            type: 'enum',
            default: 1,
            options: ['0', '1', '2'],
            help: 'settings.qosHelp',
          },
        ],
      },
      {
        label: 'settings.publish',
        fields: [
          {
            key: 'topic-template',
            label: 'settings.topicTemplate',
            type: 'text',
            placeholder: 'factory/{{.Driver}}/{{.Group}}/{{.Tag}}',
            help: 'settings.topicTemplateHelp',
          },
          {
            key: 'clean-session',
            label: 'settings.cleanSession',
            type: 'boolean',
            default: true,
            help: 'settings.cleanSessionHelp',
          },
          {
            key: 'retained',
            label: 'settings.retained',
            type: 'boolean',
            default: false,
            help: 'settings.retainedHelp',
          },
        ],
      },
      {
        label: 'settings.tls',
        advanced: true,
        fields: [
          {
            key: 'tls-ca-file',
            label: 'settings.tlsCaFile',
            type: 'text',
            placeholder: '/etc/corec/certs/ca.crt',
            help: 'settings.tlsCaFileHelp',
          },
          {
            key: 'tls-cert-file',
            label: 'settings.tlsCertFile',
            type: 'text',
            placeholder: '/etc/corec/certs/client.crt',
            help: 'settings.tlsCertFileHelp',
          },
          {
            key: 'tls-key-file',
            label: 'settings.tlsKeyFile',
            type: 'text',
            placeholder: '/etc/corec/certs/client.key',
            help: 'settings.tlsKeyFileHelp',
          },
        ],
      },
      {
        label: 'settings.command',
        advanced: true,
        fields: [
          {
            key: 'command-topic',
            label: 'settings.commandTopic',
            type: 'text',
            placeholder: 'factory/commands/#',
            help: 'settings.commandTopicHelp',
          },
          {
            key: 'command-secret',
            label: 'settings.commandSecret',
            type: 'password',
            help: 'settings.commandSecretHelp',
          },
          {
            key: 'command-max-skew',
            label: 'settings.commandMaxSkew',
            type: 'duration',
            default: '5m',
            help: 'settings.commandMaxSkewHelp',
          },
          {
            key: 'command-strict-replay',
            label: 'settings.commandStrictReplay',
            type: 'boolean',
            default: false,
            help: 'settings.commandStrictReplayHelp',
          },
          {
            key: 'command-forward-topic',
            label: 'settings.commandForwardTopic',
            type: 'text',
            placeholder: 'downstream/commands',
            help: 'settings.commandForwardTopicHelp',
          },
          {
            key: 'command-forward-secret',
            label: 'settings.commandForwardSecret',
            type: 'password',
            help: 'settings.commandForwardSecretHelp',
          },
        ],
      },
      {
        label: 'settings.chainedInbound',
        advanced: true,
        fields: [
          {
            key: 'data-topic',
            label: 'settings.dataTopic',
            type: 'text',
            placeholder: 'upstream/factory/#',
            help: 'settings.dataTopicHelp',
          },
        ],
      },
      {
        label: 'settings.timeouts',
        advanced: true,
        fields: [
          {
            key: 'keep-alive',
            label: 'settings.keepAlive',
            type: 'duration',
            default: '60s',
            help: 'settings.keepAliveHelp',
          },
          {
            key: 'connect-timeout',
            label: 'settings.connectTimeout',
            type: 'duration',
            default: '10s',
            help: 'settings.connectTimeoutHelp',
          },
          {
            key: 'publish-timeout',
            label: 'settings.publishTimeout',
            type: 'duration',
            default: '5s',
            help: 'settings.publishTimeoutHelp',
          },
          {
            key: 'subscribe-timeout',
            label: 'settings.subscribeTimeout',
            type: 'duration',
            default: '5s',
            help: 'settings.subscribeTimeoutHelp',
          },
          {
            key: 'disconnect-quiesce',
            label: 'settings.disconnectQuiesce',
            type: 'duration',
            default: '1s',
            help: 'settings.disconnectQuiesceHelp',
          },
          {
            key: 'connect-retry-interval',
            label: 'settings.connectRetryInterval',
            type: 'duration',
            default: '5s',
            help: 'settings.connectRetryIntervalHelp',
          },
          {
            key: 'auto-reconnect',
            label: 'settings.autoReconnect',
            type: 'boolean',
            default: true,
            help: 'settings.autoReconnectHelp',
          },
          {
            key: 'connect-retry',
            label: 'settings.connectRetry',
            type: 'boolean',
            default: true,
            help: 'settings.connectRetryHelp',
          },
        ],
      },
    ],
  },

  http: {
    groups: [
      {
        label: 'settings.push',
        fields: [
          {
            key: 'url',
            label: 'settings.url',
            type: 'text',
            placeholder: 'http://localhost:8080/api/v1/telemetry',
            help: 'settings.urlHelp',
          },
          {
            key: 'method',
            label: 'settings.method',
            type: 'enum',
            default: 'POST',
            options: ['GET', 'POST', 'PUT', 'PATCH'],
            help: 'settings.methodHelp',
          },
          {
            key: 'timeout',
            label: 'settings.timeout',
            type: 'duration',
            default: '5s',
            help: 'settings.httpTimeoutHelp',
          },
        ],
      },
      {
        label: 'settings.webhook',
        advanced: true,
        fields: [
          {
            key: 'webhook-addr',
            label: 'settings.webhookAddr',
            type: 'text',
            placeholder: '0.0.0.0:9091',
            help: 'settings.webhookAddrHelp',
          },
          {
            key: 'webhook-path',
            label: 'settings.webhookPath',
            type: 'text',
            default: '/data',
            help: 'settings.webhookPathHelp',
          },
          {
            key: 'webhook-secret',
            label: 'settings.webhookSecret',
            type: 'password',
            help: 'settings.webhookSecretHelp',
          },
          {
            key: 'tls-cert-file',
            label: 'settings.tlsCertFile',
            type: 'text',
            placeholder: '/etc/corec/certs/webhook.crt',
            help: 'settings.webhookTlsCertHelp',
          },
          {
            key: 'tls-key-file',
            label: 'settings.tlsKeyFile',
            type: 'text',
            placeholder: '/etc/corec/certs/webhook.key',
            help: 'settings.webhookTlsKeyHelp',
          },
        ],
      },
      {
        label: 'settings.connectionPool',
        advanced: true,
        fields: [
          {
            key: 'max-idle-conns',
            label: 'settings.maxIdleConns',
            type: 'number',
            default: 100,
            min: 0,
            help: 'settings.maxIdleConnsHelp',
          },
          {
            key: 'max-idle-conns-per-host',
            label: 'settings.maxIdleConnsPerHost',
            type: 'number',
            default: 20,
            min: 0,
            help: 'settings.maxIdleConnsPerHostHelp',
          },
          {
            key: 'idle-conn-timeout',
            label: 'settings.idleConnTimeout',
            type: 'duration',
            default: '90s',
            help: 'settings.idleConnTimeoutHelp',
          },
        ],
      },
    ],
  },
}

// ─── Transport top-level (non-settings) fields ───────────────────────
// These are siblings of `settings`, NOT inside it (config.validate fails fast
// on misplacement). Rendered in a dedicated "Publishing" step of the wizard.
export const TRANSPORT_TOPLEVEL_FIELDS: SettingsField[] = [
  {
    key: 'batch-size',
    label: 'settings.batchSize',
    type: 'number',
    default: 0,
    min: 0,
    help: 'settings.batchSizeHelp',
  },
  {
    key: 'flush-interval',
    label: 'settings.flushInterval',
    type: 'duration',
    default: '0s',
    help: 'settings.flushIntervalHelp',
  },
  {
    key: 'retry-count',
    label: 'settings.retryCount',
    type: 'number',
    default: 0,
    min: 0,
    help: 'settings.retryCountHelp',
  },
  {
    key: 'buffer-size',
    label: 'settings.bufferSize',
    type: 'number',
    default: 100,
    min: 0,
    help: 'settings.bufferSizeHelp',
  },
  {
    key: 'fallback',
    label: 'settings.fallback',
    type: 'select',
    optionsSource: 'transports',
    help: 'settings.fallbackHelp',
  },
]

// ─── Lookup helpers ──────────────────────────────────────────────────

/** Returns the field registry for a driver type, or undefined if unknown. */
export function getDriverFieldRegistry(type: string): TypeFieldRegistry | undefined {
  return DRIVER_SETTINGS_REGISTRY[type]
}

/** Returns the field registry for a transport type, or undefined if unknown. */
export function getTransportFieldRegistry(type: string): TypeFieldRegistry | undefined {
  return TRANSPORT_SETTINGS_REGISTRY[type]
}

/**
 * Builds a default settings object for a driver/transport type by collecting
 * every field's `default` value. Used when initializing a new wizard form so
 * the user sees the server's defaults pre-filled rather than an empty form.
 */
export function buildDefaultSettings(
  registry: TypeFieldRegistry | undefined,
): Record<string, unknown> {
  if (!registry) return {}
  const settings: Record<string, unknown> = {}
  for (const group of registry.groups) {
    for (const field of group.fields) {
      if (field.default !== undefined) {
        settings[field.key] = field.default
      }
    }
  }
  return settings
}
