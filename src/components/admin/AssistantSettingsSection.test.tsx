// @vitest-environment jsdom
// The provider form is where CJ AI credentials are typed and saved. It renders a
// list the panel later reads, so its contract is: what the operator types is
// what onChange hands back, and nothing that cannot work is handed back at all.
//
// The form used to have no tests. It is small, but it is the one place in the
// assistant where a key is entered by hand, which makes "does typing edit the
// right record" worth a check that is not a screenshot.
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderSettings } from '@/components/admin/AssistantSettingsSection'
import i18n from '@/i18n'
import type { AssistantProvider } from '@/types/assistant'

configure({ asyncUtilTimeout: 4000 })

const t = (key: string) => i18n.t(key)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function setup(providers: AssistantProvider[] = [], selected: string | null = null) {
  const onChange = vi.fn<(list: AssistantProvider[], sel: string | null) => void>()
  render(<ProviderSettings providers={providers} selected={selected} onChange={onChange} />)
  return { onChange }
}

const full = { name: 'p', baseUrl: 'http://llm.test/v1', model: 'm' }

describe('ProviderSettings', () => {
  it('lists what it was given and offers no save when empty', () => {
    render(<ProviderSettings providers={[]} selected={null} onChange={vi.fn()} />)
    expect(screen.getByText(t('assistant.settings.empty'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('assistant.settings.save') })).toBeNull()
  })

  it('adds a blank row on Add without immediately persisting it', () => {
    const { onChange } = setup([])
    fireEvent.click(screen.getByRole('button', { name: t('assistant.settings.add') }))
    // A blank row cannot work and must not be written: pressing "add provider"
    // is an intent to type, not a provider.
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText(t('assistant.settings.name'))).toHaveValue('')
  })

  it('saves a complete provider with what was typed', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: t('assistant.settings.add') }))
    fireEvent.change(screen.getByLabelText(t('assistant.settings.name')), {
      target: { value: 'local' },
    })
    fireEvent.change(screen.getByLabelText(t('assistant.settings.model')), {
      target: { value: 'qwen' },
    })
    fireEvent.change(screen.getByLabelText(t('assistant.settings.baseUrl')), {
      target: { value: 'http://10.0.0.7/v1' },
    })
    fireEvent.click(screen.getByRole('button', { name: t('assistant.settings.save') }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const [list, sel] = onChange.mock.calls[0]
    expect(list).toEqual([{ name: 'local', baseUrl: 'http://10.0.0.7/v1', model: 'qwen' }])
    expect(sel).toBe('local')
  })

  it('never saves a provider that cannot work', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: t('assistant.settings.add') }))
    // name + model, but no base URL: nothing can be called.
    fireEvent.change(screen.getByLabelText(t('assistant.settings.name')), {
      target: { value: 'x' },
    })
    fireEvent.change(screen.getByLabelText(t('assistant.settings.model')), {
      target: { value: 'y' },
    })
    fireEvent.click(screen.getByRole('button', { name: t('assistant.settings.save') }))

    expect(onChange.mock.calls[0][0]).toEqual([])
  })

  it('keeps the key on the record it was typed into, not the first one', () => {
    // Two providers: editing the second must not write the key into the first.
    // This is the one mistake here that leaks a credential to a gateway the
    // operator did not intend.
    const { onChange } = setup([full, { name: 'other', baseUrl: 'http://other/v1', model: 'm2' }])
    const keyFields = screen.getAllByLabelText(t('assistant.settings.apiKey'))
    expect(keyFields).toHaveLength(2)

    fireEvent.change(keyFields[1], { target: { value: 'sk-second' } })
    // One select button per row; choose the second record's.
    fireEvent.click(screen.getAllByRole('button', { name: t('assistant.settings.select') })[1])

    const list = onChange.mock.calls[0][0] as AssistantProvider[]
    expect(list[0].apiKey).toBeUndefined()
    expect(list[1].apiKey).toBe('sk-second')
  })
})
