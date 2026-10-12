import { describe, expect, it } from 'vitest'
import { buildRuleYaml, type EditFormData } from '@/lib/ruleYaml'

const baseForm: EditFormData = {
  name: 'high-temp',
  match: "tag == 'temperature' && value > 95",
  action: 'alert',
  target: 'cloud-mqtt',
  targets: '',
  priority: 10,
  transformExpression: '',
  transformTagRename: '',
  continue: false,
}

describe('buildRuleYaml — continue flag (ADR-010)', () => {
  it('omits continue line when false', () => {
    const yaml = buildRuleYaml({ ...baseForm, continue: false })
    expect(yaml).not.toContain('continue')
  })

  it('emits continue: true when set', () => {
    const yaml = buildRuleYaml({ ...baseForm, continue: true })
    expect(yaml).toContain('    continue: true')
  })

  it('emits continue after transform block', () => {
    const yaml = buildRuleYaml({
      ...baseForm,
      action: 'transform',
      target: 'cloud-mqtt',
      transformExpression: 'value * 1.8 + 32',
      transformTagRename: 'temp_f',
      continue: true,
    })
    const transformIdx = yaml.indexOf('tag-rename:')
    const continueIdx = yaml.indexOf('continue: true')
    expect(transformIdx).toBeGreaterThan(-1)
    expect(continueIdx).toBeGreaterThan(transformIdx)
  })
})
