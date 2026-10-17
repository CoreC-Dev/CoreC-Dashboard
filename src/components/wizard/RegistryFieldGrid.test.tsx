import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RegistryFieldGrid } from '@/components/wizard/RegistryFieldGrid'
import type { SettingsField } from '@/lib/settingsRegistry'

describe('RegistryFieldGrid', () => {
  it('renders text fields with labels', () => {
    const fields: SettingsField[] = [
      { key: 'host', label: 'Host', type: 'text', placeholder: 'localhost' },
    ]
    render(<RegistryFieldGrid fields={fields} settings={{}} onChange={() => {}} />)
    expect(screen.getByText('Host')).toBeDefined()
  })

  it('renders object field as a sub-grid with sub-field labels', () => {
    const fields: SettingsField[] = [
      {
        key: 'parser',
        label: 'Parser',
        type: 'object',
        help: 'Parser help',
        subFields: [
          { key: 'type', label: 'Parser Type', type: 'text' },
          { key: 'driver', label: 'Parser Driver', type: 'text' },
        ],
      },
    ]
    render(
      <RegistryFieldGrid
        fields={fields}
        settings={{ parser: { type: 'jsonpath' } }}
        onChange={() => {}}
      />,
    )
    expect(screen.getByText('Parser')).toBeDefined()
    expect(screen.getByText('Parser Type')).toBeDefined()
    expect(screen.getByText('Parser Driver')).toBeDefined()
    expect(screen.getByText('Parser help')).toBeDefined()
  })

  it('object field onChange updates nested sub-field', () => {
    const fields: SettingsField[] = [
      {
        key: 'parser',
        label: 'Parser',
        type: 'object',
        subFields: [{ key: 'type', label: 'Parser Type', type: 'text' }],
      },
    ]
    let captured: Record<string, unknown> = {}
    render(
      <RegistryFieldGrid
        fields={fields}
        settings={{ parser: { type: 'default' } }}
        onChange={(key, val) => {
          captured = { [key]: val }
        }}
      />,
    )
    const input = screen.getByDisplayValue('default')
    fireEvent.change(input, { target: { value: 'jsonpath' } })
    expect(captured.parser).toEqual({ type: 'jsonpath' })
  })

  it('object field works with empty/undefined settings value', () => {
    const fields: SettingsField[] = [
      {
        key: 'parser',
        label: 'Parser',
        type: 'object',
        subFields: [{ key: 'type', label: 'Parser Type', type: 'text' }],
      },
    ]
    render(<RegistryFieldGrid fields={fields} settings={{}} onChange={() => {}} />)
    // Sub-field label should still render even without existing value
    expect(screen.getAllByText('Parser Type').length).toBeGreaterThan(0)
  })
})
