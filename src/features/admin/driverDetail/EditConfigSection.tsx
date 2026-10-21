// Driver quick-edit form + its private helpers, extracted from
// DriverDetailPage (D2, quality audit 2026-10-21): field metadata comes from
// the settings registry (single source of truth — TD-ARCH-011/TD-DUP-001)
// via registryToEditFields. Behavior identical to the inline version.
import { dump } from 'js-yaml'
import type React from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigRaw } from '@/api/hooks'
import { EntityEditConfigCard } from '@/components/admin/DetailPageParts'
import { ConfigApplyConfirmationDialog } from '@/components/wizard/ConfigApplyConfirmationDialog'
import type { EntityEditConfigState } from '@/hooks/useEntityEditConfig'
import { useEntityEditConfig } from '@/hooks/useEntityEditConfig'
import { dumpConfigYaml, parseConfigYaml, upsertDriver } from '@/lib/configYaml'
import { type RegistryEditField, registryToEditFields } from '@/lib/registryAdapter'
import { DRIVER_TOPLEVEL_FIELDS, getDriverFieldRegistry } from '@/lib/settingsRegistry'
import type { CoreCConfig, DriverConfig } from '@/types/config'
import type { DriverStatus } from '@/types/models'

// Renders a collapsible form that lets operators edit a driver's southbound
// connection parameters, preview the generated YAML and hot-reload it through
// PUT /configs (useUpdateConfig). Field metadata is derived from the settings
// registry (single source of truth — TD-ARCH-011/TD-DUP-001) via the
// registryToEditFields adapter; no local field arrays are duplicated here.

/** Resolve the edit fields for a driver type from the settings registry. */
function getDriverFields(type: string): readonly RegistryEditField[] {
  return registryToEditFields(getDriverFieldRegistry(type), DRIVER_TOPLEVEL_FIELDS)
}

/** Serialize an existing config value into the string form the edit form uses.
 *  Objects are JSON-stringified (not `[object Object]`) so they round-trip
 *  correctly if a future driver field is a nested map. [C-2] */
function driverConfigValueToString(src: unknown): string {
  if (src === undefined || src === null) return ''
  if (typeof src === 'object') return JSON.stringify(src)
  return String(src)
}

/** Build a driver entry ({ name, type, settings, ...top-level }) from the edit
 *  form values. Fields tagged `group: 'settings'` go inside `settings`; fields
 *  tagged `group: 'top'` (e.g. tags-file, tags-interval) are placed as
 *  top-level siblings — matching configSchema + the wizard (bug fix: the
 *  previous local arrays wrote tags-file inside `settings`). */
function buildDriverEntry(
  driver: DriverStatus,
  fields: readonly RegistryEditField[],
  values: Record<string, string>,
): Record<string, unknown> {
  const settings: Record<string, unknown> = {}
  const entry: Record<string, unknown> = { name: driver.name, type: driver.type }
  for (const f of fields) {
    const raw = (values[f.key] ?? '').trim()
    if (raw === '') continue
    const val = f.kind === 'number' ? (Number.isNaN(Number(raw)) ? raw : Number(raw)) : raw
    if (f.group === 'settings') settings[f.key] = val
    else entry[f.key] = val
  }
  if (Object.keys(settings).length > 0) entry.settings = settings
  return entry
}

function buildDriverYaml(
  driver: DriverStatus,
  fields: readonly RegistryEditField[],
  values: Record<string, string>,
): string {
  return dump(
    { drivers: [buildDriverEntry(driver, fields, values)] },
    { skipInvalid: true, noRefs: true, lineWidth: -1 },
  )
}

export const DriverEditConfigSection: React.FC<{ driver: DriverStatus }> = ({ driver }) => {
  const { t } = useTranslation()
  const fields = useMemo(() => getDriverFields(driver.type), [driver.type])
  // Saved server YAML — the "before" side of the reload confirmation diff.
  const { data: rawYaml } = useConfigRaw()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const prefillValues = useCallback(
    (cfg: CoreCConfig): Record<string, string> | null => {
      const me = cfg.drivers?.find((d) => d.name === driver.name)
      if (!me) return null
      const init: Record<string, string> = {}
      for (const f of fields) {
        // Top-level fields (tags-file, tags-interval) live on the driver entry;
        // settings fields live inside `settings`.
        const src =
          f.group === 'settings'
            ? me.settings?.[f.key]
            : (me as unknown as Record<string, unknown>)[f.key]
        init[f.key] = driverConfigValueToString(src)
      }
      return init
    },
    [driver.name, fields],
  )

  const buildPreviewYaml = useCallback(
    (flds: readonly RegistryEditField[], vals: Record<string, string>) =>
      buildDriverYaml(driver, flds, vals),
    [driver],
  )

  const buildApplyYaml = useCallback(
    (raw: string, flds: readonly RegistryEditField[], vals: Record<string, string>): string => {
      const fullConfig = parseConfigYaml(raw)
      const existing = fullConfig.drivers?.find((d) => d.name === driver.name)
      const built = buildDriverEntry(driver, flds, vals)
      // Merge the edited settings + top-level fields onto the existing driver
      // (preserving its tags etc.), or create a fresh one with empty tags.
      const updatedDriver: DriverConfig = existing
        ? {
            ...existing,
            ...built,
            settings: { ...(existing.settings ?? {}), ...(built.settings ?? {}) },
          }
        : {
            name: driver.name,
            type: driver.type,
            settings: (built.settings as Record<string, unknown>) ?? {},
            tags: [],
          }
      return dumpConfigYaml(upsertDriver(fullConfig, updatedDriver))
    },
    [driver],
  )

  const edit = useEntityEditConfig<RegistryEditField>({
    entityName: driver.name,
    fields,
    prefillValues,
    buildPreviewYaml,
    buildApplyYaml,
    successKey: 'drivers.editConfig.reloadSuccess',
    failureKey: 'drivers.editConfig.reloadFailed',
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
        fieldIdPrefix="driver-field-"
        labelFor={(f) => t(f.labelKey)}
        labels={{
          title: t('drivers.editConfig.title'),
          description: t('drivers.editConfig.description'),
          toggleAriaLabel: t('drivers.editConfig.toggle'),
          unsupportedMessage: t('drivers.editConfig.unsupportedProtocol'),
          yamlPreviewLabel: t('drivers.editConfig.yamlPreview'),
          reloadingLabel: t('drivers.editConfig.reloading'),
          reloadButtonLabel: t('drivers.editConfig.previewAndReload'),
          savedSecretPlaceholder: t('drivers.editConfig.savedSecret'),
          showSecretAriaLabel: t('drivers.editConfig.showSecret'),
          hideSecretAriaLabel: t('drivers.editConfig.hideSecret'),
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
