import i18n from '@/i18n'
import type { DataTypeString } from '@/lib/constants'

/**
 * Numeric range bounds per CoreC data type. Prevents a malformed write
 * command from silently sending null (NaN serializes to null in JSON) or
 * an out-of-range value to a physical actuator.
 */
const NUMERIC_RANGES: Record<string, [number, number]> = {
  int8: [-128, 127],
  int16: [-32768, 32767],
  int32: [-2147483648, 2147483647],
  int64: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  uint8: [0, 255],
  uint16: [0, 65535],
  uint32: [0, 4294967295],
  uint64: [0, Number.MAX_SAFE_INTEGER],
  float32: [-3.4e38, 3.4e38],
  // float64 can represent values up to ±1.79e308. Using the JS safe-integer
  // range (±9.007e15) here would wrongly reject legitimate large/small float
  // write values — e.g. scientific notation or large counter writes.
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE],
}

/**
 * Validates the raw input for the chosen data type. Returns an error
 * message string if invalid, or null if valid.
 *
 * This is shared between WriteControlPage and TagExplorerPage so every
 * write path enforces the same safety rules before issuing a physical
 * write. The translation function is resolved via the shared i18n
 * singleton rather than threaded through the call signature: validateValue
 * is only ever invoked from event handlers (never during render), so the
 * instance reads the user's active locale at call time and messages stay
 * in sync with language switches.
 */
export const validateValue = (raw: string, dt: DataTypeString): string | null => {
  if (dt === 'bool') {
    const v = raw.trim().toLowerCase()
    if (v !== 'true' && v !== 'false' && v !== '0' && v !== '1') {
      return i18n.t('write.errBoolInvalid')
    }
    return null
  }
  if (dt.startsWith('int') || dt.startsWith('uint') || dt.startsWith('float')) {
    const n = Number(raw)
    if (raw.trim() === '' || Number.isNaN(n)) {
      return i18n.t('write.errNotNumber', { raw, dt })
    }
    if (!Number.isFinite(n)) {
      return i18n.t('write.errNotFinite')
    }
    const range = NUMERIC_RANGES[dt]
    if (range && (n < range[0] || n > range[1])) {
      return i18n.t('write.errOutOfRange', { n, dt, min: range[0], max: range[1] })
    }
    return null
  }
  // string / bytes — any non-empty input is accepted (required attr guards empty)
  return null
}
