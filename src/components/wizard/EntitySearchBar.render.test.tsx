// @vitest-environment jsdom
/**
 * Render behavior tests for EntitySearchBar (TD-TEST-015).
 *
 * The sibling `.test.ts` file covers the pure `filterEntities` helper. These
 * tests render the actual EntitySearchBar wired to a minimal parent list and
 * assert the user-facing behavior: typing filters the list, empty input shows
 * everything.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { EntitySearchBar, filterEntities } from '@/components/wizard/EntitySearchBar'
import i18n from '@/i18n'

// Pin English so the placeholder is the predictable "Search...".
beforeAll(() => {
  i18n.changeLanguage('en')
})

// vitest.config.ts has no `globals: true`, so @testing-library/react's
// auto-cleanup never registers — clean up explicitly between tests.
afterEach(() => {
  cleanup()
})

interface TestEntity {
  name: string
  type?: string
}

const ENTITIES: TestEntity[] = [
  { name: 'modbus-pump-1', type: 'modbus-tcp' },
  { name: 'opcua-server', type: 'opcua' },
  { name: 's7-plc', type: 's7' },
  { name: 'modbus-rtu-sensor', type: 'modbus-rtu' },
]

/** Minimal parent that wires EntitySearchBar's onChange to filterEntities + a list. */
function SearchableList({ entities }: { entities: TestEntity[] }) {
  const [query, setQuery] = useState('')
  const filtered = filterEntities(entities, query)
  return (
    <div>
      <EntitySearchBar value={query} onChange={setQuery} />
      <ul>
        {filtered.map((e) => (
          <li key={e.name}>{e.name}</li>
        ))}
      </ul>
    </div>
  )
}

describe('EntitySearchBar (render)', () => {
  it('shows all entities when the input is empty', () => {
    render(<SearchableList entities={ENTITIES} />)

    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('filters the rendered list as the user types', () => {
    render(<SearchableList entities={ENTITIES} />)
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: 'modbus' } })

    expect(input).toHaveValue('modbus')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('modbus-pump-1')).toBeInTheDocument()
    expect(screen.getByText('modbus-rtu-sensor')).toBeInTheDocument()
    expect(screen.queryByText('opcua-server')).not.toBeInTheDocument()
    expect(screen.queryByText('s7-plc')).not.toBeInTheDocument()
  })
})
