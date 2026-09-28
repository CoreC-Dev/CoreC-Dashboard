import { describe, expect, it } from 'vitest'
import { validateFullConfig } from './configSchema'
import { CONFIG_TEMPLATES, getTemplateById, getTemplatesByCategory } from './configTemplates'
import { parseConfigYaml } from './configYaml'

describe('configTemplates', () => {
  // ─── Template registry ──────────────────────────────────────────
  it('has at least 5 templates', () => {
    expect(CONFIG_TEMPLATES.length).toBeGreaterThanOrEqual(5)
  })

  it('all templates have unique IDs', () => {
    const ids = CONFIG_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all templates have required fields', () => {
    for (const t of CONFIG_TEMPLATES) {
      expect(t.id).toBeTruthy()
      expect(t.name).toBeTruthy()
      expect(t.description).toBeTruthy()
      expect(t.category).toBeTruthy()
      expect(t.icon).toBeTruthy()
      expect(t.yaml).toBeTruthy()
      expect(t.yaml.length).toBeGreaterThan(0)
    }
  })

  it('covers all 4 categories', () => {
    const categories = new Set(CONFIG_TEMPLATES.map((t) => t.category))
    expect(categories.has('industrial')).toBe(true)
    expect(categories.has('iot')).toBe(true)
    expect(categories.has('relay')).toBe(true)
    expect(categories.has('blank')).toBe(true)
  })

  // ─── YAML parsing ───────────────────────────────────────────────
  it('all templates parse as valid YAML', () => {
    for (const t of CONFIG_TEMPLATES) {
      const config = parseConfigYaml(t.yaml)
      expect(config).toBeDefined()
      expect(Object.keys(config).length).toBeGreaterThan(0)
    }
  })

  // ─── Config validation ──────────────────────────────────────────
  it('non-blank templates pass validateFullConfig', () => {
    for (const t of CONFIG_TEMPLATES) {
      if (t.id === 'blank') continue // blank template has no drivers/transports, expected to fail
      const config = parseConfigYaml(t.yaml)
      const result = validateFullConfig(config)
      if (!result.valid) {
        console.error(`Template "${t.id}" validation errors:`, result.errors)
      }
      expect(result.valid).toBe(true)
    }
  })

  it('blank template has minimal structure', () => {
    const config = parseConfigYaml(CONFIG_TEMPLATES.find((t) => t.id === 'blank')!.yaml)
    expect(config).toBeDefined()
    expect(config.node).toBeDefined()
    expect(config.global).toBeDefined()
  })

  // ─── Template-specific checks ───────────────────────────────────
  it('modbus-mqtt template has modbus-tcp driver and mqtt transport', () => {
    const config = parseConfigYaml(getTemplateById('modbus-mqtt')!.yaml)
    expect(config.drivers?.[0]?.type).toBe('modbus-tcp')
    expect(config.transports?.[0]?.type).toBe('mqtt')
  })

  it('opcua-http template has opcua driver and http transport', () => {
    const config = parseConfigYaml(getTemplateById('opcua-http')!.yaml)
    expect(config.drivers?.[0]?.type).toBe('opcua')
    expect(config.transports?.[0]?.type).toBe('http')
  })

  it('s7-mqtt-transform template has transform rule', () => {
    const config = parseConfigYaml(getTemplateById('s7-mqtt-transform')!.yaml)
    const transformRule = config.rules?.find((r) => r.action === 'transform')
    expect(transformRule).toBeDefined()
    expect(transformRule?.transform).toBeDefined()
    expect(transformRule?.transform?.expression).toBe('value * 1.8 + 32')
  })

  it('relay-node template has zero drivers and mirror rule', () => {
    const config = parseConfigYaml(getTemplateById('relay-node')!.yaml)
    expect(config.drivers ?? []).toHaveLength(0)
    const mirrorRule = config.rules?.find((r) => r.action === 'mirror')
    expect(mirrorRule).toBeDefined()
    expect(mirrorRule?.targets).toBeDefined()
    expect(mirrorRule!.targets!.length).toBeGreaterThanOrEqual(2)
  })

  it('mqtt-http-batch template has fallback transport', () => {
    const config = parseConfigYaml(getTemplateById('mqtt-http-batch')!.yaml)
    const cloudMqtt = config.transports?.find((tp) => tp.name === 'cloud-mqtt')
    expect(cloudMqtt?.fallback).toBe('http-backup')
  })

  // ─── Helper functions ───────────────────────────────────────────
  it('getTemplatesByCategory returns correct templates', () => {
    const industrial = getTemplatesByCategory('industrial')
    expect(industrial.length).toBeGreaterThanOrEqual(1)
    expect(industrial.every((t) => t.category === 'industrial')).toBe(true)
  })

  it('getTemplateById returns correct template', () => {
    const t = getTemplateById('modbus-mqtt')
    expect(t).toBeDefined()
    expect(t!.id).toBe('modbus-mqtt')
  })

  it('getTemplateById returns undefined for unknown ID', () => {
    expect(getTemplateById('nonexistent')).toBeUndefined()
  })
})
