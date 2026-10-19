// @vitest-environment jsdom
// C-B4 regression: deleting a sub-rule inside a rule group must pass the
// same confirmation gate the group delete already had — the row delete used
// to vanish the sub-rule instantly. C-B5 cases (rename SUB-RULE reference
// scan) join this file in their own commit.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuleGroupEditor } from '@/features/admin/RuleGroupEditor'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'
import type { CoreCConfig, RuleConfig } from '@/types/config'

vi.setConfig({ testTimeout: 15_000 })

const SUB_1: RuleConfig = { name: 'sub-1', match: 'tag == "temp"', action: 'drop', priority: 100 }
const SUB_2: RuleConfig = { name: 'sub-2', match: 'value > 5', action: 'drop', priority: 110 }

const WORKING: CoreCConfig = { 'rule-groups': { 'group-a': [SUB_1, SUB_2] } }

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  useConfigStore.setState({
    workingConfig: WORKING,
    savedConfig: WORKING,
    dirty: true,
    seedStatus: 'ready',
    seedError: null,
  })
})

afterEach(() => {
  cleanup()
  useConfigStore.getState().reset()
})

/** Expand the accordion and return its row-delete buttons. */
async function expandedRowDeleteButtons() {
  await screen.findByText('group-a')
  await act(async () => {
    fireEvent.click(screen.getByText('group-a'))
  })
  // Header delete + one delete per visible sub-rule row.
  return screen.getAllByRole('button', { name: 'Delete' })
}

describe('RuleGroupEditor — sub-rule delete confirmation (C-B4)', () => {
  it('row delete opens a confirm dialog; nothing is removed before Confirm', async () => {
    render(
      <MemoryRouter>
        <RuleGroupEditor />
      </MemoryRouter>,
    )

    const deleteButtons = await expandedRowDeleteButtons()
    // 1 header delete + 2 row deletes while expanded.
    expect(deleteButtons.length).toBe(3)
    await act(async () => {
      fireEvent.click(deleteButtons.at(-1)!) // the last row's delete
    })

    // The dialog names the sub-rule and the store is untouched.
    expect(await screen.findByText('Delete sub-rule')).toBeTruthy()
    expect(screen.getByText(/Are you sure you want to delete sub-rule "sub-2"/)).toBeTruthy()
    expect(useConfigStore.getState().workingConfig?.['rule-groups']?.['group-a']).toHaveLength(2)

    // Confirm → only that sub-rule leaves the group.
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    })
    const rules = useConfigStore.getState().workingConfig?.['rule-groups']?.['group-a'] ?? []
    expect(rules).toHaveLength(1)
    expect(rules.map((r) => r.name)).toEqual(['sub-1'])
  })

  it('cancel keeps the sub-rule', async () => {
    render(
      <MemoryRouter>
        <RuleGroupEditor />
      </MemoryRouter>,
    )

    const deleteButtons = await expandedRowDeleteButtons()
    await act(async () => {
      fireEvent.click(deleteButtons.at(-1)!)
    })
    expect(await screen.findByText('Delete sub-rule')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })
    expect(useConfigStore.getState().workingConfig?.['rule-groups']?.['group-a']).toHaveLength(2)
    expect(screen.queryByText('Delete sub-rule')).toBeNull()
  })
})
