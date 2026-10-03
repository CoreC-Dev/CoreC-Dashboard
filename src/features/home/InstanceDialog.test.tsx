// @vitest-environment jsdom
//
// TD-TEST-007 — InstanceDialog form validation.
//
// The zod schema (`instanceSchema`) is module-private in InstanceDialog.tsx, so
// the schema rules (name required, baseUrl must be http/https, secret >= 8) are
// exercised through the rendered react-hook-form + zodResolver form rather than
// imported directly.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstanceDialog } from '@/features/home/InstanceDialog'
import i18n from '@/i18n'

// Radix renders the dialog into a portal on document.body; without explicit
// cleanup the portals accumulate across tests and queries match stale copies.
afterEach(cleanup)

// Locale-agnostic lookup: the component renders with the same global i18n
// instance, so resolving the expected strings through it keeps assertions
// stable regardless of the saved locale.
const t = (key: string) => i18n.t(key)

function renderDialog() {
  const onSubmit = vi.fn()
  const onOpenChange = vi.fn()
  render(<InstanceDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />)
  return { onSubmit, onOpenChange }
}

// Field locators. Placeholders are used because they are unique per field and
// avoid relying on label/id association (the secret field's FormControl Slot
// wraps a wrapper <div>, so its id lands on the div rather than the input).
const nameInput = () => screen.getByPlaceholderText(t('instances.namePlaceholder'))
const baseUrlInput = () => screen.getByPlaceholderText('http://127.0.0.1:9090')
const secretInput = () => screen.getByPlaceholderText('********')
const submitButton = () => screen.getByRole('button', { name: t('instances.add') })

async function typeIn(element: HTMLElement, value: string) {
  await act(async () => {
    fireEvent.change(element, { target: { value } })
  })
}

async function submit() {
  await act(async () => {
    fireEvent.click(submitButton())
  })
}

describe('InstanceDialog form validation (TD-TEST-007)', () => {
  it('shows an error when name is empty on submit', async () => {
    renderDialog()
    await submit()
    await waitFor(() => {
      expect(screen.getByText(t('instances.nameRequired'))).toBeInTheDocument()
    })
  })

  it('shows an error when baseUrl is not an http/https URL', async () => {
    renderDialog()
    await typeIn(baseUrlInput(), 'ftp://bad.example')
    await submit()
    await waitFor(() => {
      expect(screen.getByText(t('instances.urlInvalid'))).toBeInTheDocument()
    })
  })

  it('shows an error when secret is shorter than 8 characters', async () => {
    renderDialog()
    await submit()
    await waitFor(() => {
      expect(screen.getByText(t('instances.secretMin'))).toBeInTheDocument()
    })
  })

  it('calls onSubmit with normalized data when input is valid', async () => {
    const { onSubmit } = renderDialog()
    // baseUrl defaults to DEFAULT_COREC_URL (http://127.0.0.1:9090) which is valid.
    await typeIn(nameInput(), 'Test Instance')
    await typeIn(secretInput(), 'secret123')
    await submit()
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Test Instance',
      baseUrl: 'http://127.0.0.1:9090',
      secret: 'secret123',
    })
  })

  it('blocks submit when input is invalid', async () => {
    const { onSubmit } = renderDialog()
    await submit()
    // Validation ran and surfaced the name error, confirming the submit was
    // attempted and rejected — onSubmit must not have fired.
    await waitFor(() => {
      expect(screen.getByText(t('instances.nameRequired'))).toBeInTheDocument()
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
