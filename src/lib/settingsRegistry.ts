/**
 * Settings Field Metadata Registry — Barrel & Helpers
 *
 * Re-exports types, driver/transport registries, and lookup helpers.
 * (Split from single 878-line file — TD-ARCH-013.)
 */

// Registries
export { DRIVER_SETTINGS_REGISTRY, DRIVER_TOPLEVEL_FIELDS } from '@/lib/settingsRegistryDriver'
export {
  TRANSPORT_SETTINGS_REGISTRY,
  TRANSPORT_TOPLEVEL_FIELDS,
} from '@/lib/settingsRegistryTransport'
// Types & shared fragments
export type {
  SettingsField,
  TypeFieldRegistry,
} from '@/lib/settingsRegistryTypes'

import { DRIVER_SETTINGS_REGISTRY } from '@/lib/settingsRegistryDriver'
import { TRANSPORT_SETTINGS_REGISTRY } from '@/lib/settingsRegistryTransport'
// Local imports for helpers
import type { TypeFieldRegistry } from '@/lib/settingsRegistryTypes'

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
