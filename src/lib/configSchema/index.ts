/**
 * configSchema/index.ts — validateFullConfig composes the zod tree
 * (./schema) with the cross-entity checks (./validators).
 */
import { coreCConfigSchema } from '@/lib/configSchema/schema'
import {
  type ConfigValidationError,
  type ConfigValidationResult,
  validateConfig,
} from '@/lib/configSchema/validators'

export {
  coreCConfigSchema,
  derivedTagConfigSchema,
  isValidGoDuration,
} from '@/lib/configSchema/schema'
export { type ConfigValidationResult, validateConfig } from '@/lib/configSchema/validators'

/**
 * Full validation: run zod schema parse (shape + intra-entity) then
 * cross-entity validateConfig. Returns all errors found.
 */
export function validateFullConfig(config: unknown): ConfigValidationResult {
  const schemaErrors: ConfigValidationError[] = []
  const parsed = coreCConfigSchema.safeParse(config)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      schemaErrors.push({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })
    }
    // Still run cross-entity checks on the raw input to collect all errors.
  }
  const cross = validateConfig(config)
  const errors = [...schemaErrors, ...cross.errors]
  return { valid: errors.length === 0, errors, warnings: cross.warnings }
}
