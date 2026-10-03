/**
 * Registry → Edit-Field Adapter
 *
 * Converts settingsRegistry's `SettingsField` metadata to the flat
 * `{ key, labelKey, kind, options?, placeholder? }` shape consumed by
 * EntityEditConfigCard in detail pages.
 *
 * **Status (TD-ARCH-011 / TD-DUP-001):** Infrastructure laid in Batch D.
 * Full migration (deleting local *_FIELDS arrays in DriverDetailPage /
 * TransportDetailPage) is deferred to Batch I because it involves behavior
 * changes (field-set additions/drops, placeholder fixes, zh-CN label
 * reconciliation) that must be committed separately per C4.
 *
 * Known divergences documented by the subagent feasibility analysis:
 *  - Reconnect fields in registry but missing from 4 of 5 detail arrays
 *  - `retry` in detail arrays for udp variants but absent from their registry
 *  - OPCUA security-policy: 6 options in detail vs 4 in registry
 *  - ~10 placeholder differences (some are bug fixes, e.g. modbus-tls port)
 *  - 2 zh-CN label wording differences (retry, caFile)
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
}

/** Map registry FieldType → edit-field kind (7→3, lossy). */
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
      // EntityEditConfigCard has no checkbox; render as text.
      return 'text'
  }
}

/** Convert a single SettingsField to a RegistryEditField. */
function toEditField(field: SettingsField): RegistryEditField {
  return {
    key: field.key,
    labelKey: field.label,
    kind: mapFieldType(field.type),
    options: field.options,
    placeholder:
      field.placeholder ?? (field.default !== undefined ? String(field.default) : undefined),
  }
}

/**
 * Flatten a TypeFieldRegistry (+ optional top-level fields) into a flat
 * array of RegistryEditFields for detail-page edit forms.
 *
 * @param registry  The driver/transport field registry (groups of fields).
 * @param toplevel  Top-level fields (siblings of `settings`, e.g. tags-file).
 * @returns Flat array of edit fields in registry order.
 */
export function registryToEditFields(
  registry: TypeFieldRegistry | undefined,
  toplevel: readonly SettingsField[] = [],
): RegistryEditField[] {
  const fields: RegistryEditField[] = []
  if (registry) {
    for (const group of registry.groups) {
      for (const field of group.fields) {
        fields.push(toEditField(field))
      }
    }
  }
  for (const field of toplevel) {
    fields.push(toEditField(field))
  }
  return fields
}
