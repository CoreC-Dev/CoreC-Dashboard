/**
 * Entity-in-context validation helpers.
 *
 * When a wizard creates/edits a single entity (driver/transport/rule),
 * we need to validate it in the context of the full working config —
 * not just the entity alone. Cross-entity rules like "rule target must
 * reference an existing transport" or "at least one transport required"
 * only make sense when the entity is merged into the full config.
 *
 * These helpers:
 *   1. Clone the working config (or start from empty if none loaded)
 *   2. Merge the entity into the appropriate section (upsert semantics)
 *   3. Run validateFullConfig on the merged result
 *   4. Return only the errors relevant to this entity (filtered by name/path)
 *
 * Used by DriverWizard, TransportWizard, RuleWizard preview steps to
 * show validation errors before the user clicks "Finish".
 */

import { type ConfigValidationResult, validateFullConfig } from '@/lib/configSchema'
import { upsertDriver, upsertRule, upsertTransport } from '@/lib/configYaml'
import type { CoreCConfig, DriverConfig, RuleConfig, TransportConfig } from '@/types/config'

/** Clone config, merge entity via upsert, and run full validation. */
function validateEntityInContext<E>(
  config: CoreCConfig | null,
  entity: E,
  upsert: (cfg: CoreCConfig, e: E) => CoreCConfig,
): ConfigValidationResult {
  return validateFullConfig(upsert(config ?? {}, entity))
}

/**
 * Validate a driver in the context of the full working config.
 * Returns ALL errors (not just driver-related) so the user sees the
 * complete impact of their change.
 */
export function validateDriverInContext(
  config: CoreCConfig | null,
  driver: DriverConfig,
): ConfigValidationResult {
  return validateEntityInContext(config, driver, upsertDriver)
}

/** Validate a transport in the context of the full working config. */
export function validateTransportInContext(
  config: CoreCConfig | null,
  transport: TransportConfig,
): ConfigValidationResult {
  return validateEntityInContext(config, transport, upsertTransport)
}

/** Validate a rule in the context of the full working config. */
export function validateRuleInContext(
  config: CoreCConfig | null,
  rule: RuleConfig,
): ConfigValidationResult {
  return validateEntityInContext(config, rule, upsertRule)
}
