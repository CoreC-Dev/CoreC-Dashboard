// @vitest-environment jsdom
// Static splash (UX audit A-12): main.tsx awaits the proxy-mode probe (up to
// ~3s on a cold start) before createRoot, and index.html's #root used to be
// empty during that whole window — a dead-white screen with no hint whether
// the app is loading or broken. The splash must:
//  1. Live INSIDE #root, where createRoot().render() clears it on mount (the
//     clearing behavior itself is pinned by this suite against the real
//     react-dom, not assumed).
//  2. Say what is happening in both shipped languages (the splash renders
//     before i18n loads, so it cannot pick one).
//  3. Use inline styles only — no <script> (CSP script-src pins just the
//     theme bootstrap hash) and no classes/CSS vars (the CSS bundle is not
//     guaranteed to have executed yet).
import { act, cleanup } from '@testing-library/react'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

const htmlModules = import.meta.glob('../index.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const html = Object.values(htmlModules)[0] ?? ''

afterEach(cleanup)

function rootInnerHTML(): string {
  const match = html.match(/<div id="root">([\s\S]*?)<\/div>\s*<script type="module"/)
  expect(
    match,
    'index.html must have a #root div immediately before the module script',
  ).toBeTruthy()
  return match![1]
}

describe('static boot splash (A-12)', () => {
  it('shows bilingual loading copy inside #root before React mounts', () => {
    const markup = rootInnerHTML()
    expect(markup).toContain('正在加载 CoreC Dashboard…')
    expect(markup).toContain('Loading CoreC Dashboard…')
    expect(markup).toContain('style=')
    // The splash must not smuggle in a second inline script — CSP script-src
    // pins only the theme bootstrap's hash, so an extra script would be
    // silently blocked and is the wrong tool for a static splash anyway.
    expect(markup).not.toContain('<script')
  })

  it('renders the app logo while the shell has not mounted yet', () => {
    expect(rootInnerHTML()).toContain('/logo-animated.svg')
  })

  it('createRoot().render replaces the static splash on mount', () => {
    const container = document.createElement('div')
    container.innerHTML = rootInnerHTML()
    document.body.appendChild(container)

    const root = createRoot(container)
    act(() => {
      root.render(React.createElement('p', null, 'app mounted'))
    })

    expect(container.innerHTML).not.toContain('正在加载 CoreC Dashboard…')
    expect(container.textContent).toContain('app mounted')
  })
})
