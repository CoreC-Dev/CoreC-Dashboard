// @vitest-environment jsdom
/**
 * Render behavior tests for ConfigApplyConfirmationDialog (TD-TEST-015).
 *
 * The sibling `.test.ts` file covers the pure helpers (computeConfigDiff /
 * computeLineDiff). These tests render the actual component with
 * @testing-library/react and assert what the operator sees: the diff summary
 * badges and the Apply button's enabled/disabled state.
 *
 * NOTE on the Apply button: the component sets
 *   disabled={applying || hasValidationErrors}
 * It does NOT gate on `totalChanges`, so the Apply button stays enabled even
 * when there are zero changes. These tests document that actual behavior
 * (source is intentionally not modified).
 */
import { cleanup, render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ConfigApplyConfirmationDialog } from '@/components/wizard/ConfigApplyConfirmationDialog'
import i18n from '@/i18n'

// Pin English so translated labels can be matched exactly and readably.
beforeAll(() => {
  i18n.changeLanguage('en')
})

// vitest.config.ts has no `globals: true`, so @testing-library/react's
// auto-cleanup never registers — clean up explicitly between tests.
afterEach(() => {
  cleanup()
})

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof ConfigApplyConfirmationDialog>> = {},
) {
  const props: React.ComponentProps<typeof ConfigApplyConfirmationDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    beforeYaml: null,
    afterYaml: '',
    applying: false,
    onConfirm: vi.fn(),
    ...overrides,
  }
  return render(<ConfigApplyConfirmationDialog {...props} />)
}

// A config that adds one driver (d2) → summary.drivers.added === 1.
const BEFORE_YAML = ['drivers:', '  - name: d1', ''].join('\n')
const AFTER_YAML = ['drivers:', '  - name: d1', '  - name: d2', ''].join('\n')

describe('ConfigApplyConfirmationDialog (render)', () => {
  it('shows a diff summary when open with changes', () => {
    renderDialog({ beforeYaml: BEFORE_YAML, afterYaml: AFTER_YAML })

    // Dialog is open → title is present.
    expect(screen.getByText(/Apply Configuration Changes/)).toBeInTheDocument()
    // Structural diff computed a driver addition → "Drivers" badge with "+1".
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('apply button is enabled when there are changes', () => {
    renderDialog({ beforeYaml: BEFORE_YAML, afterYaml: AFTER_YAML })

    const applyButton = screen.getByRole('button', { name: /Apply Changes/ })
    expect(applyButton).toBeEnabled()
  })

  it('apply button stays enabled when totalChanges === 0 (no changes)', () => {
    // The component disables on `applying || validationErrors`, not on
    // totalChanges — so with identical YAML (zero changes) and not applying,
    // the Apply button remains enabled.
    renderDialog({ beforeYaml: BEFORE_YAML, afterYaml: BEFORE_YAML })

    const applyButton = screen.getByRole('button', { name: /Apply Changes/ })
    expect(applyButton).toBeEnabled()
  })

  it('apply button is disabled while applying', () => {
    renderDialog({ beforeYaml: BEFORE_YAML, afterYaml: AFTER_YAML, applying: true })

    // While applying the action label becomes "Applying…" and is disabled.
    const applyingButton = screen.getByRole('button', { name: /Applying/ })
    expect(applyingButton).toBeDisabled()
  })
})
