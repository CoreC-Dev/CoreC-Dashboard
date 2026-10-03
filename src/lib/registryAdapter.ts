/**
 * Registry → Edit-Field Adapter
 *
 * Converts settingsRegistry's `SettingsField` metadata to the flat
 * `{ key, labelKey, kind, options?, placeholder? }` shape consumed by
 * EntityEditConfigCard in detail pages.
 *
 * **Status (TD-ARCH-011 / TD-DUP-001):** Infrastructure laid in Batch D;
 *  full migration done in the Batch-D close-out. Detail pages now derive their
 *  edit fields from the registry via this adapter and the local `*_FIELDS`
 *  arrays have been deleted. The adapter carries `group` (settings vs
 *  top-level) and `boolean` so detail pages can build YAML correctly and
 *  convert boolean selects on save.
 *
 *  Resolved divergences (registry adopted as single source per ADR-009;
 *  each is a documented behavior change):
 *  - Reconnect group now shown for every driver (was only modbus-tcp)
 *  - `retry` follows registry (present for modbus-tcp/rtu, absent for udp variants)
 *  - OPCUA security-policy: 4 registry options (was 6 — drops Basic128Rsa15/Basic256)
 *  - Placeholders now match registry (e.g. modbus-tls port 502→802 bug fix)
 *  - zh-CN labels follow registry wording (retry, caFile)
 *  - driver `tags-file`/`tags-interval` now written top-level (was inside
 *    `settings` — bug fix aligning with configSchema + wizard)
 */

import type { SettingsField, TypeFieldRegistry } from '@/lib/settingsRegistry'

/** Flat edit-field shape (mirrors EditField from DetailPageParts, but defined
 *  here to respect layer boundaries — lib/ cannot import from components/). */
export interface RegistryEditField {
  key: string
  labelKey: string
  kind: 'text' | 'number' | 'select'
  options?: readonly string[]
  placeholder?: string
  /** Whether this field lives inside `settings` or as a top-level sibling.
   *  Carried so detail pages can place values correctly when building YAML
   *  (e.g. driver `tags-file` is top-level, not inside `settings`). */
  group: 'settings' | 'top'
  /** Whether this select field stores a YAML boolean (options are "true"/"false").
   *  Set when the registry field type is `boolean`; lets detail pages convert
   *  the string form used by the edit control back to a real boolean on save. */
  boolean?: boolean
}

/** Map registry FieldType → edit-field kind (7→3). `boolean` is rendered as a
 *  true/false select (EntityEditConfigCard has no checkbox); the caller can
 *  detect this via the `boolean` flag and convert on save. */
function mapFieldType(type: SettingsField['type']): RegistryEditField['kind'] {
  switch (type) {
    case 'text':
    case 'duration':
    case 'password':
      return 'text'
    case 'number':
      return 'number'
    case 'enum':
    case 'select':
      return 'select'
    case 'boolean':
      return 'select'
  }
}

/** Convert a single SettingsField to a RegistryEditField. */
function toEditField(field: SettingsField, group: 'settings' | 'top'): RegistryEditField {
  const isBoolean = field.type === 'boolean'
  return {
    key: field.key,
    labelKey: field.label,
    kind: mapFieldType(field.type),
    options: isBoolean ? ['true', 'false'] : field.options,
    placeholder:
      field.placeholder ?? (field.default !== undefined ? String(field.default) : undefined),
    group,
    boolean: isBoolean || undefined,
  }
}

/**
 * Flatten a TypeFieldRegistry (+ optional top-level fields) into a flat
 * array of RegistryEditFields for detail-page edit forms.
 *
 * @param registry  The driver/transport field registry (groups of fields).
 * @param toplevel  Top-level fields (siblings of `settings`, e.g. tags-file).
 * @returns Flat array of edit fields in registry order. Fields from `registry`
 *  are tagged `group: 'settings'`; fields from `toplevel` are tagged
 *  `group: 'top'` so detail pages can place them correctly when building YAML.
 */
export function registryToEditFields(
  registry: TypeFieldRegistry | undefined,
  toplevel: readonly SettingsField[] = [],
): RegistryEditField[] {
  const fields: RegistryEditField[] = []
  if (registry) {
    for (const group of registry.groups) {
      for (const field of group.fields) {
        fields.push(toEditField(field, 'settings'))
      }
    }
  }
  for (const field of toplevel) {
    fields.push(toEditField(field, 'top'))
  }
  return fields
}
