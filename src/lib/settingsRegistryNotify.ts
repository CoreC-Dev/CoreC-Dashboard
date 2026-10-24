/**
 * Notify Transport Settings Registry
 *
 * Own module so settingsRegistryTransport.ts stays under the 500-line
 * custom-lint limit (custom-lint.mjs MAX_LINES).
 */
import type { TypeFieldRegistry } from '@/lib/settingsRegistryTypes'

export const NOTIFY_SETTINGS_REGISTRY: TypeFieldRegistry = {
  groups: [
    {
      label: 'settings.notifyChannel',
      fields: [
        {
          key: 'channel',
          label: 'settings.channel',
          type: 'enum',
          required: true,
          options: ['slack', 'teams', 'email', 'webhook'],
          help: 'settings.channelHelp',
        },
        {
          key: 'cooldown',
          label: 'settings.cooldown',
          type: 'duration',
          default: '5m',
          help: 'settings.cooldownHelp',
        },
      ],
    },
    {
      label: 'settings.notifySlackTeams',
      fields: [
        {
          key: 'webhook-url',
          label: 'settings.webhookUrl',
          type: 'password',
          placeholder: 'https://hooks.slack.com/services/...',
          help: 'settings.webhookUrlHelp',
        },
        {
          key: 'template',
          label: 'settings.messageTemplate',
          type: 'text',
          default: '[{{.Rule}}] {{.Tag}} = {{.Value}} ({{.Driver}})',
          help: 'settings.templateHelp',
        },
      ],
    },
    {
      label: 'settings.notifyEmail',
      advanced: true,
      fields: [
        {
          key: 'smtp-host',
          label: 'settings.smtpHost',
          type: 'text',
          placeholder: 'smtp.example.com',
        },
        {
          key: 'smtp-port',
          label: 'settings.smtpPort',
          type: 'number',
          default: 587,
          min: 1,
          max: 65535,
        },
        {
          key: 'smtp-user',
          label: 'settings.smtpUser',
          type: 'text',
        },
        {
          key: 'smtp-pass',
          label: 'settings.smtpPass',
          type: 'password',
        },
        {
          key: 'from',
          label: 'settings.from',
          type: 'text',
          placeholder: 'corec@example.com',
        },
        {
          key: 'to',
          label: 'settings.to',
          type: 'text',
          placeholder: 'oncall@example.com',
          help: 'settings.toHelp',
        },
        {
          key: 'subject',
          label: 'settings.subject',
          type: 'text',
          default: '[CoreC] {{.Rule}}',
        },
        {
          key: 'body',
          label: 'settings.body',
          type: 'text',
          default: 'Tag {{.Tag}} on {{.Driver}}/{{.Device}} = {{.Value}} at {{.Timestamp}}',
        },
      ],
    },
    {
      label: 'settings.notifyWebhook',
      advanced: true,
      fields: [
        {
          key: 'url',
          label: 'settings.url',
          type: 'text',
          placeholder: 'https://custom-webhook.example.com/alert',
        },
        {
          key: 'method',
          label: 'settings.method',
          type: 'enum',
          default: 'POST',
          options: ['POST', 'PUT'],
        },
        {
          key: 'headers',
          label: 'settings.headers',
          type: 'text',
          help: 'settings.headersHelp',
        },
        {
          key: 'body-template',
          label: 'settings.bodyTemplate',
          type: 'text',
          default: '{"tag":"{{.Tag}}","value":{{.Value}}}',
        },
      ],
    },
  ],
}
