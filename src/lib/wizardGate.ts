/**
 * Wizard gate-reason helpers (UX audit C-A5).
 *
 * "Please fix the errors before continuing" told the operator nothing
 * about WHICH of a dozen registry fields was still empty. The step-1
 * gates in DriverWizard/TransportWizard use these helpers to compute a
 * concrete reason for the Wizard's gate-hint line: the i18n LABEL KEYS
 * of required settings fields whose value is still empty, so the caller
 * can translate and list them ("Missing required: Host, Port").
 */
import type { TypeFieldRegistry } from '@/lib/settingsRegistry'

const isEmptyValue = (v: unknown): boolean => v === undefined || v === null || v === ''

/**
 * i18n label keys of REQUIRED registry fields whose current value is
 * empty. Composite 'object' fields contribute their required sub-fields
 * (read from the object value at the field key, mirroring how
 * RegistryFieldGrid renders them).
 */
export function missingRequiredSettingLabels(
  registry: TypeFieldRegistry | undefined,
  settings: Record<string, unknown>,
): string[] {
  if (!registry) return []
  const out: string[] = []
  for (const group of registry.groups) {
    for (const field of group.fields) {
      if (field.type === 'object' && field.subFields) {
        const obj = (settings[field.key] as Record<string, unknown> | undefined) ?? {}
        for (const sub of field.subFields) {
          if (sub.required && isEmptyValue(obj[sub.key])) out.push(sub.label)
        }
        continue
      }
      if (field.required && isEmptyValue(settings[field.key])) out.push(field.label)
    }
  }
  return out
}
