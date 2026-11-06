import { describe, expect, it } from 'vitest'
import { assistantTools } from '@/features/assistant/tools'

/**
 * The tool list IS the authorization: a tool the model cannot see is a tool
 * it cannot talk itself into calling. These constraints mirror corec-mcp's
 * read-only default, so they get tests of their own rather than being implied
 * by some component's behaviour.
 *
 * Scope note: this file checks the DASHBOARD's side of the contract only --
 * which verbs it offers and that writes stay off by default. It cannot check
 * that the names still match cmd/corec-mcp/tools.go, because the Go sources are
 * not in this repository and CI should not reach outside the checkout to find
 * them. That comparison lives in the CoreC checkout, which ships
 * tools_manifest.json (generated from its own toolDefs() by a Go test) and
 * scripts/check-tools-parity.mjs; run it there, or run it here with
 * COREC_DIR pointing at a CoreC checkout.
 */
describe('assistantTools', () => {
  it('exposes no write-class tool by default', () => {
    const tools = assistantTools(false)
    expect(tools.length).toBeGreaterThan(0)
    expect(tools.filter((t) => t.toolClass === 'write')).toEqual([])
  })

  it('adds write tools only when explicitly allowed, keeping the read ones', () => {
    const read = assistantTools(false)
    const all = assistantTools(true)
    const writes = all.filter((t) => t.toolClass === 'write')

    expect(writes.length).toBeGreaterThan(0)
    for (const r of read) {
      expect(all.some((t) => t.name === r.name)).toBe(true)
    }
  })

  it('never registers the same name twice', () => {
    const names = assistantTools(true).map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('every tool carries an object argument schema', () => {
    for (const t of assistantTools(true)) {
      expect(t.schema.type, `${t.name} schema`).toBe('object')
    }
  })

  it('write-class is exactly the four control verbs', () => {
    // Pinned deliberately. The parity script promises the READ verbs are a
    // superset of corec-mcp's; this is what stops a control verb from being
    // reclassified as read (and so becoming callable with the switch off) in
    // a change that only edits tools.ts.
    expect(
      assistantTools(true)
        .filter((t) => t.toolClass === 'write')
        .map((t) => t.name)
        .sort(),
    ).toEqual(['ack_alert', 'pause_driver', 'resume_driver', 'write_tag'])
  })
})
