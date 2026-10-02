/**
 * Transport Settings Registry
 *
 * (Split from settingsRegistry.ts — TD-ARCH-013.)
 */
import type { SettingsField, TypeFieldRegistry } from './settingsRegistryTypes'

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
