import { describe, expect, it } from 'vitest'
import { filterEntities } from './EntitySearchBar'

interface TestEntity {
  name: string
  type?: string
}

describe('filterEntities', () => {
  const entities: TestEntity[] = [
    { name: 'modbus-pump-1', type: 'modbus-tcp' },
    { name: 'opcua-server', type: 'opcua' },
    { name: 's7-plc', type: 's7' },
    { name: 'modbus-rtu-sensor', type: 'modbus-rtu' },
  ]

  it('returns all entities when query is empty', () => {
    expect(filterEntities(entities, '')).toHaveLength(4)
  })

  it('returns all entities when query is whitespace only', () => {
    expect(filterEntities(entities, '   ')).toHaveLength(4)
  })

  it('filters by name (case-insensitive)', () => {
    const result = filterEntities(entities, 'MODBUS')
    expect(result).toHaveLength(2)
    expect(result.map((e) => e.name)).toEqual(['modbus-pump-1', 'modbus-rtu-sensor'])
  })

  it('filters by type (case-insensitive)', () => {
    const result = filterEntities(entities, 'opcua')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('opcua-server')
  })

  it('matches partial name', () => {
    const result = filterEntities(entities, 'pump')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('modbus-pump-1')
  })

  it('returns empty array when no match', () => {
    expect(filterEntities(entities, 'nonexistent')).toHaveLength(0)
  })

  it('handles entities without type field', () => {
    const noType: TestEntity[] = [{ name: 'rule-1' }, { name: 'rule-2' }]
    const result = filterEntities(noType, 'rule')
    expect(result).toHaveLength(2)
  })

  it('trims query before matching', () => {
    const result = filterEntities(entities, '  s7  ')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('s7-plc')
  })
})
