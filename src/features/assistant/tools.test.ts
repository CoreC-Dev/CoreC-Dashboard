import { describe, expect, it } from 'vitest'
import { assistantTools } from '@/features/assistant/tools'

/**
 * The tool list IS the authorization: a tool the model cannot see is a tool
 * it cannot talk itself into calling. These constraints mirror corec-mcp's
 * read-only default, so they get tests of their own rather than being implied
 * by some component's behaviour.
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

  it('names and shapes match CoreC MCP tools', () => {
    const all = assistantTools(true)
    const byName = new Map(all.map((t) => [t.name, t]))
    // Names copied from cmd/corec-mcp/tools.go; a rename here without one there
    // is the drift this assertion exists to catch.
    for (const name of [
      'list_drivers',
      'driver_status',
      'list_tags',
      'list_alerts',
      'list_paused_drivers',
      'get_configs',
      'validate_configs',
      'write_tag',
      'pause_driver',
      'resume_driver',
      'ack_alert',
    ]) {
      expect(byName.get(name), `missing tool ${name}`).toBeTruthy()
    }
    for (const t of all) {
      expect(t.schema.type, `${t.name} schema`).toBe('object')
    }
    // Write-class is exactly the control surface, not the read surface.
    expect(byName.get('write_tag')?.toolClass).toBe('write')
    expect(byName.get('list_tags')?.toolClass).toBe('read')
  })
})
