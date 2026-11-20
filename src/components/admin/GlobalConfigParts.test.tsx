// @vitest-environment jsdom
// log-format and stale-threshold are hot-patchable via PATCH /configs
// (CoreC supportedPatchKeys), so their rows must not carry the restart
// badge; genuinely restart-only fields keep it.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { LoggingSection } from '@/components/admin/GlobalConfigParts'
import { ApiSection, EngineSection } from '@/components/admin/GlobalConfigSections'
import i18n from '@/i18n'
import type { GlobalConfig } from '@/types/config'

const t = (key: string) => i18n.t(key)

/** The FieldRow element that contains the given label text. */
function rowOf(label: string): HTMLElement {
  const el = screen.getByText(label)
  const row = el.closest('.space-y-1')
  expect(row).toBeTruthy()
  return row as HTMLElement
}

function badgeCountIn(row: HTMLElement): number {
  return Array.from(row.querySelectorAll('*')).filter(
    (n) => n.textContent === t('globalConfig.restartRequired'),
  ).length
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
})

describe('restart badges on hot-patchable global fields', () => {
  it('log-format row carries no restart badge', () => {
    render(<LoggingSection global={{}} update={() => {}} />)

    const row = rowOf(t('globalConfig.logFormat'))
    expect(badgeCountIn(row)).toBe(0)
  })

  it('stale-threshold row carries no restart badge', () => {
    render(<EngineSection engine={{}} update={() => {}} />)

    const row = rowOf(t('globalConfig.engineStaleThreshold'))
    expect(badgeCountIn(row)).toBe(0)
  })

  it('restart-only fields keep the badge (api.listen, engine.workers)', () => {
    render(<ApiSection api={{} as NonNullable<GlobalConfig['api']>} update={() => {}} />)
    expect(badgeCountIn(rowOf(t('globalConfig.apiListen')))).toBeGreaterThan(0)
    cleanup()

    render(<EngineSection engine={{}} update={() => {}} />)
    expect(badgeCountIn(rowOf(t('globalConfig.engineWorkers')))).toBeGreaterThan(0)
  })
})
