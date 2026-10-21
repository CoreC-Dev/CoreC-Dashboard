// Transport quick-edit form + its private helpers, extracted from
// TransportDetailPage (D2, quality audit 2026-10-21): field metadata comes
// from the settings registry (single source of truth — TD-ARCH-011/
// TD-DUP-001) via registryToEditFields; the curated key sets select which
// fields appear in the quick-edit form (advanced/dynamic fields — TLS certs,
// command forwarding, fallback dynamic-select, connect-retry tuning — are
// edited via the wizard, not this form). Behavior identical to the inline
// version.
import { dump } from 'js-yaml'
import type React from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigRaw } from '@/api/hooks'
import { EntityEditConfigCard } from '@/components/admin/DetailPageParts'
import { ConfigApplyConfirmationDialog } from '@/components/wizard/ConfigApplyConfirmationDialog'
import type { EntityEditConfigState } from '@/hooks/useEntityEditConfig'
import { useEntityEditConfig } from '@/hooks/useEntityEditConfig'
import { dumpConfigYaml, parseConfigYaml, upsertTransport } from '@/lib/configYaml'
import { type RegistryEditField, registryToEditFields } from '@/lib/registryAdapter'
import { getTransportFieldRegistry, TRANSPORT_TOPLEVEL_FIELDS } from '@/lib/settingsRegistry'
import type { CoreCConfig, TransportConfig } from '@/types/config'
import type { TransportStatus } from '@/types/models'

// Renders a collapsible form that lets operators edit a transport's northbound
// publishing parameters, preview the generated YAML and hot-reload it through
// PUT /configs (useUpdateConfig). Field METADATA is derived from the settings
// registry (single source of truth — TD-ARCH-011/TD-DUP-001) via the
// registryToEditFields adapter. The set of fields shown is a curated
// presentation choice (quick-edit form): advanced/dynamic fields (TLS certs,
// command forwarding, fallback dynamic-select, connect-retry tuning) are edited
// via the wizard, not this form.

// Curated field keys exposed by the quick-edit form. The registry is the single
// source of metadata (label/placeholder/options/type/group/boolean); this list
// only selects which fields appear here.
const MQTT_EDIT_KEYS = new Set([
  'broker',
  'topic-template',
  'client-id',
  'qos',
  'data-topic',
  'command-topic',
  'retained',
  'clean-session',
  'keep-alive',
  'connect-timeout',
  'publish-timeout',
  'auto-reconnect',
  'username',
  'password',
  'retry-count',
  'buffer-size',
])
const HTTP_EDIT_KEYS = new Set([
  'url',
  'method',
  'headers',
  'webhook-addr',
  'webhook-path',
  'webhook-secret',
  'timeout',
  'max-idle-conns',
  'idle-conn-timeout',
  'batch-size',
  'flush-interval',
  'retry-count',
  'buffer-size',
])
const NOTIFY_EDIT_KEYS = new Set([
  'channel',
  'cooldown',
  'webhook-url',
  'template',
  'smtp-host',
  'smtp-port',
  'smtp-user',
  'smtp-pass',
  'from',
  'to',
  'subject',
  'body',
  'url',
  'method',
  'headers',
  'body-template',
  'batch-size',
  'flush-interval',
  'retry-count',
  'buffer-size',
])

// `headers` is a map field not yet modeled by the registry (SettingsField has no
// map/object type); retained as an explicit supplement until the registry gains
// one. [TD-ARCH-011 follow-up — tracked in tech-debt-tracker]
const HEADERS_SUPPLEMENT: RegistryEditField = {
  key: 'headers',
  labelKey: 'transports.editConfig.headers',
  kind: 'text',
  group: 'settings',
  placeholder: 'Content-Type:application/json',
}

/** Resolve the curated edit fields for a transport type from the settings
 *  registry, preserving registry order. `headers` (http only) is appended as a
 *  supplement since the registry does not yet model map fields. */
function getTransportFields(type: string): readonly RegistryEditField[] {
  const lower = type.toLowerCase()
  const isMqtt = lower.includes('mqtt')
  const isHttp = lower.includes('http')
  const isNotify = lower.includes('notify')
  if (!isMqtt && !isHttp && !isNotify) return []
  const keys = isMqtt ? MQTT_EDIT_KEYS : isHttp ? HTTP_EDIT_KEYS : NOTIFY_EDIT_KEYS
  const all = registryToEditFields(getTransportFieldRegistry(type), TRANSPORT_TOPLEVEL_FIELDS)
  const filtered = all.filter((f) => keys.has(f.key))
  if (isHttp) {
    // Insert the headers supplement right after `method` (its natural position).
    const idx = filtered.findIndex((f) => f.key === 'method')
    const out = [...filtered]
    out.splice(idx + 1, 0, HEADERS_SUPPLEMENT)
    return out
  }
  return filtered
}

function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of raw.split(',')) {
    const idx = part.indexOf(':')
    if (idx <= 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k) out[k] = v
  }
  return out
}

/** Serialize an existing config value into the string form the edit form uses.
 *  Handles objects (e.g. headers) and numbers. [C-2] */
function configValueToString(f: RegistryEditField, src: unknown): string {
  if (src === undefined || src === null) return ''
  if (f.key === 'headers' && typeof src === 'object' && !Array.isArray(src)) {
    return Object.entries(src as Record<string, unknown>)
      .map(([k, v]) => `${k}:${String(v)}`)
      .join(',')
  }
  if (typeof src === 'object') return JSON.stringify(src)
  return String(src)
}

function buildTransportEntry(
  transport: TransportStatus,
  fields: readonly RegistryEditField[],
  values: Record<string, string>,
): Record<string, unknown> {
  const settings: Record<string, unknown> = {}
  const top: Record<string, unknown> = {}
  for (const f of fields) {
    const raw = (values[f.key] ?? '').trim()
    if (raw === '') continue
    let val: unknown
    if (f.key === 'headers') {
      const headers = parseHeaders(raw)
      if (Object.keys(headers).length === 0) continue
      val = headers
    } else if (f.boolean) {
      val = raw === 'true'
    } else if (f.kind === 'number') {
      const n = Number(raw)
      val = Number.isNaN(n) ? raw : n
    } else {
      val = raw
    }
    if (f.group === 'settings') settings[f.key] = val
    else top[f.key] = val
  }
  const entry: Record<string, unknown> = { name: transport.name, type: transport.type }
  if (Object.keys(settings).length > 0) entry.settings = settings
  // Top-level transport fields (batch-size, flush-interval, retry-count, buffer-size).
  for (const [k, v] of Object.entries(top)) entry[k] = v
  return entry
}

function buildTransportYaml(
  transport: TransportStatus,
  fields: readonly RegistryEditField[],
  values: Record<string, string>,
): string {
  return dump(
    { transports: [buildTransportEntry(transport, fields, values)] },
    { skipInvalid: true, noRefs: true, lineWidth: -1 },
  )
}

export const TransportEditConfigSection: React.FC<{ transport: TransportStatus }> = ({
  transport,
}) => {
  const { t } = useTranslation()
  const fields = useMemo(() => getTransportFields(transport.type), [transport.type])
  // Saved server YAML — the "before" side of the reload confirmation diff.
  const { data: rawYaml } = useConfigRaw()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const prefillValues = useCallback(
    (cfg: CoreCConfig): Record<string, string> | null => {
      const me = cfg.transports?.find((tp) => tp.name === transport.name)
      if (!me) return null
      const init: Record<string, string> = {}
      for (const f of fields) {
        const src = f.group === 'settings' ? me.settings?.[f.key] : me[f.key as keyof typeof me]
        init[f.key] = configValueToString(f, src)
      }
      return init
    },
    [transport.name, fields],
  )

  const buildPreviewYaml = useCallback(
    (flds: readonly RegistryEditField[], vals: Record<string, string>) =>
      buildTransportYaml(transport, flds, vals),
    [transport],
  )

  const buildApplyYaml = useCallback(
    (raw: string, flds: readonly RegistryEditField[], vals: Record<string, string>): string => {
      const fullConfig = parseConfigYaml(raw)
      const existing = fullConfig.transports?.find((tp) => tp.name === transport.name)
      const entry = buildTransportEntry(transport, flds, vals)
      const base: TransportConfig = existing ?? {
        name: transport.name,
        type: transport.type,
        settings: {},
      }
      // Deep-merge settings onto the saved transport: fields the quick-edit
      // form leaves blank (masked secrets above all, C-A4) are omitted
      // from `entry` and must keep the stored value — a shallow
      // `{...base, ...entry}` would wipe them.
      const updatedTransport = {
        ...base,
        ...entry,
        settings: {
          ...(base.settings ?? {}),
          ...((entry.settings as Record<string, unknown>) ?? {}),
        },
      } as TransportConfig
      return dumpConfigYaml(upsertTransport(fullConfig, updatedTransport))
    },
    [transport],
  )

  const edit = useEntityEditConfig<RegistryEditField>({
    entityName: transport.name,
    fields,
    prefillValues,
    buildPreviewYaml,
    buildApplyYaml,
    successKey: 'transports.editConfig.reloadSuccess',
    failureKey: 'transports.editConfig.reloadFailed',
  })

  // C-A1: the reload button no longer PUTs directly — it opens the SAME
  // ConfigApplyConfirmationDialog the list pages use (YAML diff + change
  // summary + engine-suspend warning). The PUT only fires from the dialog's
  // explicit confirm, and the dialog stays open showing the verbatim error
  // when the reload fails.
  const editWithGate: EntityEditConfigState = {
    ...edit,
    handleReload: async () => {
      // Gate: do not reload here — only stage the confirmation dialog.
      // Resolves false because nothing was reloaded on this call; the
      // dialog's confirm invokes the real (ungated) edit.handleReload.
      setConfirmOpen(true)
      return false
    },
  }

  return (
    <>
      <EntityEditConfigCard
        edit={editWithGate}
        fields={fields}
        fieldIdPrefix="transport-field-"
        labelFor={(f) => t(f.labelKey)}
        labels={{
          title: t('transports.editConfig.title'),
          description: t('transports.editConfig.description'),
          toggleAriaLabel: t('transports.editConfig.toggle'),
          unsupportedMessage: t('transports.editConfig.unsupportedProtocol'),
          yamlPreviewLabel: t('transports.editConfig.yamlPreview'),
          reloadingLabel: t('transports.editConfig.reloading'),
          reloadButtonLabel: t('transports.editConfig.previewAndReload'),
          savedSecretPlaceholder: t('transports.editConfig.savedSecret'),
          showSecretAriaLabel: t('transports.editConfig.showSecret'),
          hideSecretAriaLabel: t('transports.editConfig.hideSecret'),
        }}
      />
      <ConfigApplyConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        beforeYaml={rawYaml ?? null}
        afterYaml={edit.applyYaml}
        applying={edit.isReloading}
        applyError={edit.reloadError ?? undefined}
        onConfirm={() => {
          void edit.handleReload().then((ok) => {
            if (ok) setConfirmOpen(false)
          })
        }}
      />
    </>
  )
}
