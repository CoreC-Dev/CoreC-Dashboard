import type { TFunction } from 'i18next'
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
 * write. The translation function `t` is passed explicitly (TD-ARCH-009)
 * so this module stays pure — no i18n singleton import.
 */
export const validateValue = (raw: string, dt: DataTypeString, t: TFunction): string | null => {
  if (dt === 'bool') {
    const v = raw.trim().toLowerCase()
    if (v !== 'true' && v !== 'false' && v !== '0' && v !== '1') {
      return t('write.errBoolInvalid')
    }
    return null
  }
  if (dt.startsWith('int') || dt.startsWith('uint') || dt.startsWith('float')) {
    const n = Number(raw)
    if (raw.trim() === '' || Number.isNaN(n)) {
      return t('write.errNotNumber', { raw, dt })
    }
    if (!Number.isFinite(n)) {
      return t('write.errNotFinite')
    }
    // Integer types must be whole numbers — a fractional value like 10.5
    // for int8 passes the range check but would write a float to a physical
    // actuator expecting an integer.
    if ((dt.startsWith('int') || dt.startsWith('uint')) && !Number.isInteger(n)) {
      return t('write.errNotInteger', { raw, dt })
    }
    const range = NUMERIC_RANGES[dt]
    if (range && (n < range[0] || n > range[1])) {
      return t('write.errOutOfRange', { n, dt, min: range[0], max: range[1] })
    }
    return null
  }
  // string / bytes — any non-empty input is accepted (required attr guards empty)
  return null
}
