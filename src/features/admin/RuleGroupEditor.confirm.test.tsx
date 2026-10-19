// @vitest-environment jsdom
// C-B4 regression: deleting a sub-rule inside a rule group must pass the
// same confirmation gate the group delete already had — the row delete used
// to vanish the sub-rule instantly.
// C-B5 regression: renaming a group must surface the SUB-RULE references
// that would break and offer to rewrite them (default on) — the rename used
// to leave dead references everywhere silently.
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

// ─── C-B5: rename vs SUB-RULE references ──────────────────────────────

/** Working config where group-a is referenced from a top-level rule and
 *  from another group's sub-rule. */
const REFS_WORKING: CoreCConfig = {
  rules: [
    {
      name: 'top-ref',
      match: 'SUB-RULE:group-a && value > 80',
      action: 'alert',
      priority: 10,
    },
  ],
  'rule-groups': {
    'group-a': [SUB_1],
    'group-b': [{ name: 'nested', match: 'SUB-RULE:group-a', action: 'drop', priority: 100 }],
  },
}

/** Open a group's rename input (by card order), type the new name, Enter. */
async function renameGroup(from: string, to: string, cardIndex = 0) {
  await screen.findByText(from)
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[cardIndex]!)
  })
  const input = screen.getByDisplayValue(from)
  await act(async () => {
    fireEvent.change(input, { target: { value: to } })
    fireEvent.keyDown(input, { key: 'Enter' })
  })
}

describe('RuleGroupEditor — rename scans SUB-RULE references (C-B5)', () => {
  beforeEach(() => {
    useConfigStore.setState({
      workingConfig: REFS_WORKING,
      savedConfig: REFS_WORKING,
      dirty: true,
    })
  })

  it('lists the breaking references and rewrites them on confirm (default on)', async () => {
    render(
      <MemoryRouter>
        <RuleGroupEditor />
      </MemoryRouter>,
    )

    await renameGroup('group-a', 'group-z')

    // The dialog counts both references (top-level + cross-group) and
    // lists where each lives.
    expect(
      await screen.findByText('Renaming breaks 2 SUB-RULE reference(s). Update them too?'),
    ).toBeTruthy()
    expect(screen.getByText(/top-ref/)).toBeTruthy()
    expect(screen.getByText(/nested/)).toBeTruthy()

    // Checkbox defaults to rewriting.
    const box = document.getElementById('rename-update-refs') as HTMLInputElement
    expect(box.getAttribute('data-state')).toBe('checked')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    })

    const cfg = useConfigStore.getState().workingConfig
    expect(cfg?.['rule-groups']?.['group-z']).toBeDefined()
    expect(cfg?.['rule-groups']?.['group-a']).toBeUndefined()
    expect(cfg?.rules?.find((r) => r.name === 'top-ref')?.match).toBe(
      'SUB-RULE:group-z && value > 80',
    )
    expect(cfg?.['rule-groups']?.['group-b']?.[0]?.match).toBe('SUB-RULE:group-z')
  })

  it('unchecking the box renames without rewriting — references left as-is', async () => {
    render(
      <MemoryRouter>
        <RuleGroupEditor />
      </MemoryRouter>,
    )

    await renameGroup('group-a', 'group-z')
    expect(await screen.findByText(/Renaming breaks 2 SUB-RULE reference\(s\)/)).toBeTruthy()

    await act(async () => {
      fireEvent.click(document.getElementById('rename-update-refs')!)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    })

    const cfg = useConfigStore.getState().workingConfig
    expect(cfg?.['rule-groups']?.['group-z']).toBeDefined()
    // Deliberately untouched — the operator opted out of the rewrite.
    expect(cfg?.rules?.find((r) => r.name === 'top-ref')?.match).toBe(
      'SUB-RULE:group-a && value > 80',
    )
    expect(cfg?.['rule-groups']?.['group-b']?.[0]?.match).toBe('SUB-RULE:group-a')
  })

  it('renames silently when nothing references the group', async () => {
    render(
      <MemoryRouter>
        <RuleGroupEditor />
      </MemoryRouter>,
    )

    await renameGroup('group-b', 'group-y', 1)

    const cfg = useConfigStore.getState().workingConfig
    expect(cfg?.['rule-groups']?.['group-y']).toBeDefined()
    expect(screen.queryByText(/Renaming breaks/)).toBeNull()
  })
})
