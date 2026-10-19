import { describe, expect, it } from 'vitest'
import en from '@/i18n/en.json'
import zhCN from '@/i18n/zh-CN.json'

// Raw text of the locale files — parsed objects silently collapse
// duplicate keys, so the duplicate-line scan must run on the source text.
// (import.meta.glob query form per the themeBoot precedent: string path,
// vite/client types it, and the structure linter allows it.)
const localeFiles = import.meta.glob('./*.json', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

/**
 * Locale parity invariant (UX-wave D suggestion): the two locale files
 * must expose EXACTLY the same key set. The parallel-edit waves showed
 * how easily one side drifts (keys added to zh only, duplicate keys from
 * index races) — this test makes any drift a hard failure.
 *
 * Note: value parity (identical interpolation placeholders) is also
 * checked: a key with {{count}} in zh but no placeholder in en would
 * silently render the raw template in one language.
 */

type Flat = Record<string, string>

function flatten(obj: Record<string, unknown>, prefix = ''): Flat {
  const out: Flat = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object') {
      Object.assign(out, flatten(v as Record<string, unknown>, key))
    } else if (typeof v === 'string') {
      out[key] = v
    }
  }
  return out
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
}

const zh = flatten(zhCN)
const enFlat = flatten(en)

describe('locale parity invariant', () => {
  it('zh-CN and en expose the same key set', () => {
    const zhOnly = Object.keys(zh).filter((k) => !(k in enFlat))
    const enOnly = Object.keys(enFlat).filter((k) => !(k in zh))
    expect(
      { zhOnly, enOnly },
      'locale drift detected — add the missing keys to BOTH files',
    ).toEqual({ zhOnly: [], enOnly: [] })
  })

  it('every shared key uses the same interpolation placeholders', () => {
    const mismatches: Record<string, { zh: string[]; en: string[] }> = {}
    for (const [key, zhValue] of Object.entries(zh)) {
      const enValue = enFlat[key]
      if (enValue === undefined) continue
      const zhPh = placeholders(zhValue)
      const enPh = placeholders(enValue)
      if (zhPh.join(',') !== enPh.join(',')) {
        mismatches[key] = { zh: zhPh, en: enPh }
      }
    }
    expect(mismatches, 'placeholder drift detected').toEqual({})
  })

  it('no adjacent duplicate key lines in the raw locale files', async () => {
    // JSON.parse silently keeps the LAST duplicate key — the parallel-edit
    // race committed `dashboard.refreshFailed` twice to both files before
    // it was caught. Parsed objects cannot reveal this (duplicates
    // collapse), so the raw source text must be scanned. The check is
    // deliberately narrow: only ADJACENT identical key lines are failures
    // (that is the exact shape the race produced); same-named keys in
    // different namespaces legitimately repeat far apart.
    for (const name of ['./zh-CN.json', './en.json']) {
      const raw = await localeFiles[name]()
      const lines = raw.split('\n').map((l) => l.trim())
      const dupes: string[] = []
      for (let i = 1; i < lines.length; i++) {
        if (lines[i] === lines[i - 1] && /^"[^"]+":/.test(lines[i])) {
          dupes.push(lines[i])
        }
      }
      expect(dupes, `${name}: adjacent duplicate key lines`).toEqual([])
    }
  })
})
