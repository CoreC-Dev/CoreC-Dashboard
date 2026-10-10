import type { TFunction } from 'i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateValue } from '@/lib/writeValidation'

// A pure stand-in for i18next's TFunction. validateValue only depends on the
// return being a non-null string for invalid input and null for valid input.
// Echoing the key (and stringified options) lets tests assert *which* error
// branch fired and with what interpolation payload.
const tMock = vi.fn((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key,
)
const t = tMock as unknown as TFunction

beforeEach(() => {
  tMock.mockClear()
})

describe('validateValue — bool', () => {
  it.each([
    ['true'],
    ['false'],
    ['0'],
    ['1'],
    ['TRUE'],
    ['True'],
    ['FALSE'],
    ['  true  '],
    [' 1 '],
    [' 0 '],
  ])('accepts %p as valid', (raw) => {
    expect(validateValue(raw, 'bool', t)).toBeNull()
  })

  it.each([['yes'], ['no'], ['2'], ['t'], ['f'], [''], ['on'], ['off'], ['truee'], ['10']])(
    'rejects %p with errBoolInvalid',
    (raw) => {
      expect(validateValue(raw, 'bool', t)).toBe('write.errBoolInvalid')
      expect(t).toHaveBeenCalledWith('write.errBoolInvalid')
    },
  )
})

describe('validateValue — int8 (-128..127)', () => {
  it.each(['0', '127', '-128', '100', '-100', '  50  '])('accepts %p', (raw) => {
    expect(validateValue(raw, 'int8', t)).toBeNull()
  })

  it.each([
    ['128', 'write.errOutOfRange'],
    ['-129', 'write.errOutOfRange'],
    ['abc', 'write.errNotNumber'],
    ['', 'write.errNotNumber'],
    ['   ', 'write.errNotNumber'],
    ['Infinity', 'write.errNotFinite'],
  ])('rejects %p with %s', (raw, key) => {
    expect(validateValue(raw, 'int8', t)).toContain(key)
  })

  it('rejects 128 with the out-of-range payload carrying n/dt/min/max', () => {
    validateValue('128', 'int8', t)
    expect(t).toHaveBeenCalledWith('write.errOutOfRange', {
      n: 128,
      dt: 'int8',
      min: -128,
      max: 127,
    })
  })

  // FL-4: int types now enforce integer-ness — a fractional value
  // inside the range is rejected with errNotInteger.
  it('rejects a fractional value inside the range (10.5)', () => {
    validateValue('10.5', 'int8', t)
    expect(tMock).toHaveBeenCalledWith('write.errNotInteger', {
      raw: '10.5',
      dt: 'int8',
    })
  })

  // Notable: Number() parses hex literals, so "0x10" → 16 passes validation.
  it('accepts a hex literal (0x10 → 16)', () => {
    expect(validateValue('0x10', 'int8', t)).toBeNull()
  })
})

describe('validateValue — int16 (-32768..32767)', () => {
  it.each(['32767', '-32768', '0'])('accepts %p', (raw) => {
    expect(validateValue(raw, 'int16', t)).toBeNull()
  })

  it.each([
    ['32768', 'write.errOutOfRange'],
    ['-32769', 'write.errOutOfRange'],
  ])('rejects %p with %s', (raw, key) => {
    expect(validateValue(raw, 'int16', t)).toContain(key)
  })
})

describe('validateValue — int32 (-2147483648..2147483647)', () => {
  it.each(['2147483647', '-2147483648', '0'])('accepts %p', (raw) => {
    expect(validateValue(raw, 'int32', t)).toBeNull()
  })

  it.each([
    ['2147483648', 'write.errOutOfRange'],
    ['-2147483649', 'write.errOutOfRange'],
  ])('rejects %p with %s', (raw, key) => {
    expect(validateValue(raw, 'int32', t)).toContain(key)
  })
})

describe('validateValue — int64 (MIN_SAFE_INTEGER..MAX_SAFE_INTEGER)', () => {
  const MAX = Number.MAX_SAFE_INTEGER // 9007199254740991
  const MIN = Number.MIN_SAFE_INTEGER // -9007199254740991

  it.each([`${MAX}`, `${MIN}`, '0'])('accepts %p', (raw) => {
    expect(validateValue(raw, 'int64', t)).toBeNull()
  })

  it.each([
    [`${MAX + 1}`, 'write.errOutOfRange'],
    [`${MIN - 1}`, 'write.errOutOfRange'],
  ])('rejects %p with %s', (raw, key) => {
    expect(validateValue(raw, 'int64', t)).toContain(key)
  })
})

describe('validateValue — uint8 (0..255)', () => {
  it.each(['0', '255', '128'])('accepts %p', (raw) => {
    expect(validateValue(raw, 'uint8', t)).toBeNull()
  })

  it.each([
    ['-1', 'write.errOutOfRange'],
    ['256', 'write.errOutOfRange'],
  ])('rejects %p with %s', (raw, key) => {
    expect(validateValue(raw, 'uint8', t)).toContain(key)
  })
})

describe('validateValue — uint16 (0..65535)', () => {
  it.each(['0', '65535'])('accepts %p', (raw) => {
    expect(validateValue(raw, 'uint16', t)).toBeNull()
  })

  it.each([
    ['-1', 'write.errOutOfRange'],
    ['65536', 'write.errOutOfRange'],
  ])('rejects %p with %s', (raw, key) => {
    expect(validateValue(raw, 'uint16', t)).toContain(key)
  })
})

describe('validateValue — uint32 (0..4294967295)', () => {
  it.each(['0', '4294967295'])('accepts %p', (raw) => {
    expect(validateValue(raw, 'uint32', t)).toBeNull()
  })

  it.each([
    ['-1', 'write.errOutOfRange'],
    ['4294967296', 'write.errOutOfRange'],
  ])('rejects %p with %s', (raw, key) => {
    expect(validateValue(raw, 'uint32', t)).toContain(key)
  })
})

describe('validateValue — uint64 (0..MAX_SAFE_INTEGER)', () => {
  const MAX = Number.MAX_SAFE_INTEGER

  it.each(['0', `${MAX}`])('accepts %p', (raw) => {
    expect(validateValue(raw, 'uint64', t)).toBeNull()
  })

  it.each([
    ['-1', 'write.errOutOfRange'],
    [`${MAX + 1}`, 'write.errOutOfRange'],
  ])('rejects %p with %s', (raw, key) => {
    expect(validateValue(raw, 'uint64', t)).toContain(key)
  })
})

describe('validateValue — float32 (-3.4e38..3.4e38)', () => {
  it.each(['0', '3.4e38', '-3.4e38', '1.5', '-1.5', '1e-10', '  12.5  '])('accepts %p', (raw) => {
    expect(validateValue(raw, 'float32', t)).toBeNull()
  })

  it.each([
    ['3.5e38', 'write.errOutOfRange'],
    ['-3.5e38', 'write.errOutOfRange'],
    ['abc', 'write.errNotNumber'],
    ['', 'write.errNotNumber'],
  ])('rejects %p with %s', (raw, key) => {
    expect(validateValue(raw, 'float32', t)).toContain(key)
  })

  // 1e400 overflows JS Number to Infinity → caught by the finite check, not
  // the range check.
  it('rejects 1e400 with errNotFinite (overflows to Infinity)', () => {
    expect(validateValue('1e400', 'float32', t)).toBe('write.errNotFinite')
  })
})

describe('validateValue — float64 (-MAX_VALUE..MAX_VALUE)', () => {
  const MAX = Number.MAX_VALUE // ~1.7976931348623157e308

  it.each(['0', `${MAX}`, `-${MAX}`, '1.79e308', '-1.79e308'])('accepts %p', (raw) => {
    expect(validateValue(raw, 'float64', t)).toBeNull()
  })

  it.each([
    ['abc', 'write.errNotNumber'],
    ['', 'write.errNotNumber'],
  ])('rejects %p with %s', (raw, key) => {
    expect(validateValue(raw, 'float64', t)).toContain(key)
  })

  it('rejects 1e309 with errNotFinite (overflows to Infinity)', () => {
    expect(validateValue('1e309', 'float64', t)).toBe('write.errNotFinite')
  })

  // Notable: float64 preserves full double precision; a high-precision decimal
  // is accepted (Number truncates to the nearest double, still in range).
  it('accepts a high-precision decimal', () => {
    expect(validateValue('1.234567890123456789', 'float64', t)).toBeNull()
  })
})

describe('validateValue — string / bytes (accept-anything fallback)', () => {
  it.each(['hello', '', '123', 'true', 'any arbitrary text!'])('string accepts %p', (raw) => {
    expect(validateValue(raw, 'string', t)).toBeNull()
  })

  it.each(['deadbeef', '', '\x00\x01'])('bytes accepts %p', (raw) => {
    expect(validateValue(raw, 'bytes', t)).toBeNull()
  })

  it('does not invoke t for string input', () => {
    validateValue('anything', 'string', t)
    expect(t).not.toHaveBeenCalled()
  })
})

describe('validateValue — fallback for unknown non-numeric types', () => {
  // Any dt that is not bool and does not start with int/uint/float falls
  // through to the accept-anything branch and returns null.
  it('accepts any value for an unrecognised type', () => {
    expect(validateValue('whatever', 'custom' as never, t)).toBeNull()
  })
})
