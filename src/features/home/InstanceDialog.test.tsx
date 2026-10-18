// @vitest-environment jsdom
//
// TD-TEST-007 — InstanceDialog form validation.
//
// The zod schema (`instanceSchema`) is module-private in InstanceDialog.tsx, so
// the schema rules (name required, baseUrl must be http/https, secret >= 8) are
// exercised through the rendered react-hook-form + zodResolver form rather than
// imported directly.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstanceDialog } from '@/features/home/InstanceDialog'
import i18n from '@/i18n'

// Radix renders the dialog into a portal on document.body; without explicit
// cleanup the portals accumulate across tests and queries match stale copies.
afterEach(cleanup)

// Locale-agnostic lookup: the component renders with the same global i18n
// instance, so resolving the expected strings through it keeps assertions
// stable regardless of the saved locale.
const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts)

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

// Suite timeout raised from the 5s default: under v8 coverage
// instrumentation on a loaded runner this file's render+act sequences
// exceeded 5s intermittently (stage-A audit finding #5: 1 flaky
// timeout in 2 coverage runs, 5/5 pass in isolation).
describe('InstanceDialog form validation (TD-TEST-007)', { timeout: 15_000 }, () => {
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
      useProxy: 'auto',
      color: undefined,
      notes: undefined,
      tags: undefined,
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

  // A-02 — the secret field must explain where the key comes from; an
  // operator seeing "API 密钥 (Bearer Token)" with zero context is the #1
  // cold-start blocker.
  it('shows the secret-location hint under the API key field (A-02)', () => {
    renderDialog()
    expect(screen.getByText(t('instances.secretHint'))).toBeInTheDocument()
  })

  // A-05 — the connection-mode select must explain its three options; the
  // previous copy leaked the internal "server.mjs" file name.
  it('explains the connection modes under the select (A-05)', () => {
    renderDialog()
    expect(screen.getByText(t('instances.proxyModeHint'))).toBeInTheDocument()
    // The refreshed copy must not leak the internal file name in either pack.
    expect(i18n.t('instances.proxyModeHint')).not.toContain('server.mjs')
    expect(i18n.t('instances.proxyModeProxy')).not.toContain('server.mjs')
  })

  // A-10 — the dialog must disclose that the key is persisted in plain
  // text localStorage BEFORE the operator saves it, not after discovery.
  it('discloses plain-text local storage under the API key field (A-10)', () => {
    renderDialog()
    expect(screen.getByText(t('instances.secretStorageNote'))).toBeInTheDocument()
  })
})

// D-13 — a one-shot "test connection" in the add/edit dialog: the operator
// verifies address + key BEFORE saving instead of discovering a bad key
// only after entering the instance. Exercises the same authenticated probe
// as the homepage card (mocked here at the fetch boundary).
describe('InstanceDialog — test connection (D-13)', { timeout: 15_000 }, () => {
  const mockFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
  globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch

  function jsonRes(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }

  beforeEach(() => {
    mockFetch.mockReset()
  })

  /** Healthy GET / + 200 /stats; per-URL overrides for failure cases. */
  function mockProbe(overrides: Record<string, Response> = {}) {
    mockFetch.mockImplementation((url: string) => {
      if (url in overrides) return Promise.resolve(overrides[url])
      if (url === '/corec-proxy/') {
        return Promise.resolve(
          jsonRes({ name: 'edge', version: '1.2.3', status: 'running', uptime: '1h' }),
        )
      }
      return Promise.resolve(jsonRes({ drivers: 0 }))
    })
  }

  async function clickTest() {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('instances.testConnection') }))
    })
  }

  it('reports success with the server version and does not submit', async () => {
    mockProbe()
    const { onSubmit } = renderDialog()
    await typeIn(secretInput(), 'secret123')

    await clickTest()

    await waitFor(() => {
      expect(screen.getByText(t('instances.testSuccess', { version: '1.2.3' }))).toBeInTheDocument()
    })
    // The test is a preview only — saving stays a separate explicit action.
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("reports a rejected key as 'unauthorized' with the card's copy", async () => {
    mockProbe({ '/corec-proxy/stats': jsonRes({ error: 'unauthorized' }, 401) })
    renderDialog()
    await typeIn(secretInput(), 'secret123')

    await clickTest()

    await waitFor(() => {
      expect(screen.getByText(t('instances.probeUnauthorized'))).toBeInTheDocument()
    })
  })

  it('does not block saving after a failed test', async () => {
    mockProbe({ '/corec-proxy/stats': jsonRes({ error: 'unauthorized' }, 401) })
    const { onSubmit } = renderDialog()
    await typeIn(nameInput(), 'Test Instance')
    await typeIn(secretInput(), 'secret123')

    await clickTest()
    await waitFor(() => {
      expect(screen.getByText(t('instances.probeUnauthorized'))).toBeInTheDocument()
    })

    // The verdict is informational — submit still works.
    await submit()
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
  })

  it('invalidates a stale verdict when the connection fields change', async () => {
    mockProbe()
    renderDialog()
    await typeIn(secretInput(), 'secret123')
    await clickTest()
    await waitFor(() => {
      expect(screen.getByText(t('instances.testSuccess', { version: '1.2.3' }))).toBeInTheDocument()
    })

    // Editing the address must clear the green verdict — it no longer
    // describes the values in the form.
    await typeIn(baseUrlInput(), 'http://10.0.0.5:9090')
    expect(
      screen.queryByText(t('instances.testSuccess', { version: '1.2.3' })),
    ).not.toBeInTheDocument()
  })
})

// D-22 — the color swatches' aria-label/title were hardcoded English
// ('Blue', 'Green'…) — screen readers and hover tooltips spoke English in a
// zh UI. They must resolve through the language packs now.
describe('InstanceDialog — localized color swatch labels (D-22)', { timeout: 15_000 }, () => {
  it('labels every color swatch with the translated color name', () => {
    renderDialog()

    for (const key of [
      'instances.colorDefault',
      'instances.colorBlue',
      'instances.colorGreen',
      'instances.colorAmber',
      'instances.colorRed',
      'instances.colorPurple',
      'instances.colorPink',
    ]) {
      const swatch = screen.getByRole('button', { name: t(key) })
      expect(swatch).toHaveAttribute('title', t(key))
    }
  })
})

// D-25 — the show/hide-secret toggle referenced common.show/common.hide,
// keys that exist in neither pack; screen readers heard the literal
// "common.show" key instead of a word.
describe('InstanceDialog — secret visibility toggle label (D-25)', { timeout: 15_000 }, () => {
  it('announces show/hide with translated, existing keys', () => {
    renderDialog()

    const toggle = secretInput().parentElement?.querySelector('button')
    expect(toggle).toBeTruthy()
    expect(toggle).toHaveAttribute('aria-label', t('instances.showSecret'))
    // The key must actually resolve — a missing key echoes the key itself.
    expect(t('instances.showSecret')).not.toBe('instances.showSecret')
    expect(t('instances.hideSecret')).not.toBe('instances.hideSecret')
  })
})
