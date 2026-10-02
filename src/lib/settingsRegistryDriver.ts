/**
 * Driver Settings Registry
 *
 * (Split from settingsRegistry.ts — TD-ARCH-013.)
 */
import {
  MODBUS_CONNECTION_FIELDS,
  RECONNECT_GROUP,
  type SettingsField,
  type TypeFieldRegistry,
} from './settingsRegistryTypes'

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

/** Top-level driver fields (siblings of `settings`, not inside it).
 *  Analogous to TRANSPORT_TOPLEVEL_FIELDS. Used by the wizard and (via
 *  registryToEditFields adapter) by the detail-page edit forms. */
export const DRIVER_TOPLEVEL_FIELDS: SettingsField[] = [
  {
    key: 'tags-file',
    label: 'settings.tagsFile',
    type: 'text',
    default: 'tags.yaml',
    help: 'settings.tagsFileHelp',
  },
  {
    key: 'tags-interval',
    label: 'settings.tagsInterval',
    type: 'duration',
    default: '1s',
    help: 'settings.tagsIntervalHelp',
  },
]
