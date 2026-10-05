// @vitest-environment jsdom
/**
 * Render behavior tests for TagCombobox — the combobox used in the Write
 * Control form for the Tag field. Verifies it is always editable, shows
 * filtered suggestions on focus, and fills value + type on selection.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TagCombobox } from '@/components/admin/WriteControlParts'
import i18n from '@/i18n'

beforeAll(() => {
  i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
})

const TAGS = [
  { name: 'temperature', type: 'float32' },
  { name: 'pressure', type: 'float32' },
  { name: 'pump_status', type: 'bool' },
]

describe('TagCombobox', () => {
  it('renders an editable input with the current value', () => {
    render(<TagCombobox value="temp" onChange={() => {}} availableTags={TAGS} />)
    const input = screen.getByDisplayValue('temp')
    expect(input).toBeInTheDocument()
  })

  it('shows all tags on focus when input is empty', () => {
    render(<TagCombobox value="" onChange={() => {}} availableTags={TAGS} />)
    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    expect(screen.getByText('temperature')).toBeInTheDocument()
    expect(screen.getByText('pressure')).toBeInTheDocument()
    expect(screen.getByText('pump_status')).toBeInTheDocument()
  })

  it('filters suggestions as you type', () => {
    render(<TagCombobox value="pump" onChange={() => {}} availableTags={TAGS} />)
    const input = screen.getByDisplayValue('pump')
    fireEvent.focus(input)
    expect(screen.getByText('pump_status')).toBeInTheDocument()
    expect(screen.queryByText('temperature')).not.toBeInTheDocument()
    expect(screen.queryByText('pressure')).not.toBeInTheDocument()
  })

  it('calls onChange and onTypeChange when a suggestion is clicked', () => {
    const onChange = vi.fn()
    const onTypeChange = vi.fn()
    render(
      <TagCombobox value="" onChange={onChange} availableTags={TAGS} onTypeChange={onTypeChange} />,
    )
    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    // Click the "pressure" suggestion
    fireEvent.mouseDown(screen.getByText('pressure'))
    expect(onChange).toHaveBeenCalledWith('pressure')
    expect(onTypeChange).toHaveBeenCalledWith('float32')
  })

  it('shows no dropdown when availableTags is empty', () => {
    render(<TagCombobox value="" onChange={() => {}} availableTags={[]} />)
    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    expect(screen.queryByText('temperature')).not.toBeInTheDocument()
  })
})
