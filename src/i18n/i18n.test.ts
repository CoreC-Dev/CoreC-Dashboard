// @vitest-environment jsdom
// D-11 — <html lang> must follow the active locale: a zh-CN default in
// index.html never updates on language switch, so screen readers kept
// reading English content with a Chinese voice engine (and vice versa).
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n, { setLocale } from '@/i18n'

const originalLocale = i18n.language

describe('i18n locale handling (D-11)', () => {
  afterEach(() => {
    setLocale(originalLocale)
    localStorage.clear()
    document.documentElement.lang = originalLocale
  })

  it('syncs <html lang> when the locale changes', () => {
    setLocale('en')
    expect(i18n.language).toBe('en')
    expect(document.documentElement.lang).toBe('en')

    setLocale('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('keeps <html lang> consistent even when the same locale is re-set', () => {
    document.documentElement.lang = 'de' // simulate external drift
    setLocale(i18n.language)
    expect(document.documentElement.lang).toBe(i18n.language)
  })

  it('applies the saved locale to <html lang> at module startup', async () => {
    localStorage.setItem('corec_locale', 'en')
    vi.resetModules()

    // Re-evaluating the module re-runs its startup sync with the saved
    // locale — an English user gets a correct <html lang="en"> even before
    // any explicit setLocale call.
    await import('@/i18n')

    expect(document.documentElement.lang).toBe('en')
  })
})
