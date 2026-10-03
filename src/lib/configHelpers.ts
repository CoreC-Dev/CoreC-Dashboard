import type { CoreCConfig } from '@/types/config'

/**
 * Set a value at a dotted path inside a plain object (shallow clone per level).
 * Example: setNestedPath(obj, 'api.listen', '0.0.0.0:9090')
 *          → obj.api = { ...obj.api, listen: '0.0.0.0:9090' }
 * When value is undefined, the key is deleted from its parent.
 *
 * (Extracted from configStore.ts — TD-ARCH-003: pure helper belongs in lib/.)
 */
export function setNestedPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  if (parts.length === 0) return
  let current = root
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!
    const child = current[key]
    if (typeof child !== 'object' || child === null || Array.isArray(child)) {
      current[key] = {}
    } else {
      current[key] = { ...child }
    }
    current = current[key] as Record<string, unknown>
  }
  const lastKey = parts[parts.length - 1]!
  if (value === undefined) {
    delete current[lastKey]
  } else {
    current[lastKey] = value
  }
}

/**
 * Structural deep-equality for plain JSON-serializable config objects.
 * Replaces the previous `JSON.stringify(a) === JSON.stringify(b)` approach,
 * which (a) allocated two strings on every keystroke and (b) was technically
 * incorrect for objects with different key-insertion orders. This recursive
 * check is order-independent and allocation-free for equal objects.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
      return false
  }
  return true
}

export function configEqual(a: CoreCConfig | null, b: CoreCConfig | null): boolean {
  return deepEqual(a, b)
}
