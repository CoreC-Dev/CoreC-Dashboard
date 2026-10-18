// @vitest-environment jsdom
// Theme bootstrap (audit D-10): index.html carries an inline, synchronous
// script that applies the saved theme before the first paint so dark users
// never flash a light frame. Two things must hold:
//  1. Behavior — the script resolves localStorage.corec_theme exactly like
//     themeStore.applyThemeToDOM does (explicit variants keep their own
//     data-theme name; system/invalid values resolve via prefers-color-scheme).
//  2. CSP — script-src pins the script's sha256 hash; editing the script
//     without re-pinning gets it BLOCKED by the CSP, so the test recomputes
//     the hash and compares.
// The html source comes in via Vite's ?raw import (works in vitest, no node
// APIs — the web tsconfig has none); the hash uses WebCrypto.
import { describe, expect, it } from 'vitest'
import html from '../index.html?raw'

function extractInlineScript(source: string): string {
  const match = source.match(/<script>([\s\S]*?)<\/script>/)
  expect(match, 'index.html must contain a plain inline <script> (theme bootstrap)').toBeTruthy()
  return match![1]
}

function cspScriptSrc(source: string): string {
  const match = source.match(/content="[^"]*script-src ([^;]*);/)
  expect(match, 'index.html must carry a CSP meta with a script-src directive').toBeTruthy()
  return match![1]
}

const script = extractInlineScript(html)

// jsdom has no matchMedia; the bootstrap reads prefers-color-scheme when the
// saved theme is system/invalid.
function stubPrefersDark(dark: boolean) {
  const stub = (query: string) => ({
    matches: dark && query.includes('dark'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
  Object.defineProperty(window, 'matchMedia', { value: stub, configurable: true })
}

/** Run the real bootstrap against a saved theme and return the DOM result. */
function bootWith(savedTheme: string | null, prefersDark = false) {
  localStorage.clear()
  if (savedTheme !== null) localStorage.setItem('corec_theme', savedTheme)
  stubPrefersDark(prefersDark)
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.classList.remove('dark')

  // The script is an IIFE designed for a <script> tag — run it verbatim.
  const run = new Function(script)
  run()

  return {
    dataTheme: document.documentElement.getAttribute('data-theme'),
    hasDarkClass: document.documentElement.classList.contains('dark'),
  }
}

async function sha256Base64(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
}

describe('theme bootstrap (D-10)', () => {
  it('index.html has the bootstrap before the app module script', () => {
    const bootPos = html.indexOf('<script>')
    const modulePos = html.indexOf('<script type="module"')
    expect(bootPos).toBeGreaterThan(-1)
    expect(modulePos).toBeGreaterThan(bootPos)
  })

  it('CSP pins the exact sha256 hash of the inline script', async () => {
    const digest = await sha256Base64(script)
    expect(cspScriptSrc(html)).toContain(`'sha256-${digest}'`)
  })

  it('keeps the explicit dark variant names (themeStore parity)', () => {
    expect(bootWith('dark')).toEqual({ dataTheme: 'dark', hasDarkClass: true })
    expect(bootWith('dark-midnight')).toEqual({ dataTheme: 'dark-midnight', hasDarkClass: true })
    expect(bootWith('dark-forest')).toEqual({ dataTheme: 'dark-forest', hasDarkClass: true })
  })

  it('light variants get no .dark class', () => {
    expect(bootWith('light')).toEqual({ dataTheme: 'light', hasDarkClass: false })
    expect(bootWith('light-sepia')).toEqual({ dataTheme: 'light-sepia', hasDarkClass: false })
    expect(bootWith('light-nord')).toEqual({ dataTheme: 'light-nord', hasDarkClass: false })
  })

  it('system/unknown/missing values resolve via prefers-color-scheme', () => {
    expect(bootWith('system', true)).toEqual({ dataTheme: 'dark', hasDarkClass: true })
    expect(bootWith('system', false)).toEqual({ dataTheme: 'light', hasDarkClass: false })
    expect(bootWith('garbage-value', true)).toEqual({ dataTheme: 'dark', hasDarkClass: true })
    expect(bootWith(null, false)).toEqual({ dataTheme: 'light', hasDarkClass: false })
  })
})
