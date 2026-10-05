import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoreCInstance } from '@/stores/instanceStore'
import { useInstanceStore } from '@/stores/instanceStore'

// Storage keys mirror the module-private constants in instanceStore.ts.
const STORAGE_KEY = 'corec_instances'
const SECRETS_STORAGE_KEY = 'corec_instance_secrets'

/** Payload shape accepted by addInstance. */
type NewInstanceData = Omit<CoreCInstance, 'id' | 'createdAt' | 'sortOrder'>

/** Minimal valid payload for addInstance with optional overrides. */
function newInstanceData(overrides: Partial<NewInstanceData> = {}): NewInstanceData {
  return {
    name: 'gateway',
    baseUrl: 'http://localhost:9090',
    secret: 'secret-token',
    ...overrides,
  }
}

/** A valid import item shape (matches importInstanceSchema in instanceStore.ts). */
function validImportItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'imp-1',
    name: 'imported',
    baseUrl: 'http://imported:9090',
    secret: 'imp-secret',
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  // Reset the store to a clean state (the module-level initialInstances was
  // captured once at import time; setState overrides it for each test).
  useInstanceStore.setState({ instances: [], probing: {}, probeErrors: {} })
})

describe('instanceStore — secret persistence', () => {
  it('stores secrets in localStorage, stripped from the metadata entry', () => {
    const id = useInstanceStore.getState().addInstance(newInstanceData({ name: 'gw-1' }))

    const localRaw = localStorage.getItem(STORAGE_KEY)
    const secretsRaw = localStorage.getItem(SECRETS_STORAGE_KEY)
    expect(localRaw).toBeTruthy()
    expect(secretsRaw).toBeTruthy()

    const localParsed = JSON.parse(localRaw as string) as Array<Record<string, unknown>>
    const secretsParsed = JSON.parse(secretsRaw as string) as Record<string, string>

    // Metadata persisted to localStorage, but the secret is stripped.
    expect(Array.isArray(localParsed)).toBe(true)
    expect(localParsed[0].id).toBe(id)
    expect(localParsed[0].secret).toBeUndefined()

    // Secret persisted to localStorage keyed by instance id.
    expect(secretsParsed[id]).toBe('secret-token')
  })

  it('omits empty secrets from the localStorage secrets map', () => {
    const id = useInstanceStore
      .getState()
      .addInstance(newInstanceData({ name: 'no-secret', secret: '' }))
    const secretsParsed = JSON.parse(localStorage.getItem(SECRETS_STORAGE_KEY) as string) as Record<
      string,
      string
    >
    expect(secretsParsed[id]).toBeUndefined()
  })
})

describe('instanceStore — CRUD', () => {
  it('addInstance appends an instance and returns its generated id', () => {
    const id = useInstanceStore.getState().addInstance(newInstanceData({ name: 'gw-1' }))
    expect(id).toBeTruthy()

    const instances = useInstanceStore.getState().instances
    expect(instances).toHaveLength(1)
    expect(instances[0].id).toBe(id)
    expect(instances[0].name).toBe('gw-1')
    expect(instances[0].sortOrder).toBe(1)
    expect(instances[0].createdAt).toBeTruthy()
  })

  it('addInstance assigns monotonically increasing sortOrder', () => {
    useInstanceStore.getState().addInstance(newInstanceData({ name: 'a' }))
    useInstanceStore.getState().addInstance(newInstanceData({ name: 'b' }))
    const instances = useInstanceStore.getState().instances
    expect(instances[0].sortOrder).toBe(1)
    expect(instances[1].sortOrder).toBe(2)
  })

  it('updateInstance merges partial data and preserves untouched fields', () => {
    const id = useInstanceStore.getState().addInstance(newInstanceData({ name: 'a' }))
    useInstanceStore.getState().updateInstance(id, { name: 'a-updated', notes: 'new notes' })

    const inst = useInstanceStore.getState().getInstance(id)
    expect(inst?.name).toBe('a-updated')
    expect(inst?.notes).toBe('new notes')
    expect(inst?.baseUrl).toBe('http://localhost:9090')
  })

  it('deleteInstance removes the instance by id', () => {
    const id1 = useInstanceStore.getState().addInstance(newInstanceData({ name: 'a' }))
    const id2 = useInstanceStore.getState().addInstance(newInstanceData({ name: 'b' }))
    useInstanceStore.getState().deleteInstance(id1)

    const instances = useInstanceStore.getState().instances
    expect(instances).toHaveLength(1)
    expect(instances[0].id).toBe(id2)
  })

  it('deleteInstance clears probe state for the removed instance', () => {
    const id = useInstanceStore.getState().addInstance(newInstanceData({ name: 'a' }))
    useInstanceStore.getState().setProbing(id, true)
    useInstanceStore.getState().setProbeResult(id, false, undefined, 'boom')
    useInstanceStore.getState().deleteInstance(id)

    expect(useInstanceStore.getState().probing[id]).toBeUndefined()
    expect(useInstanceStore.getState().probeErrors[id]).toBeUndefined()
  })

  it('getInstance returns the matching instance or undefined', () => {
    const id = useInstanceStore.getState().addInstance(newInstanceData({ name: 'a' }))
    expect(useInstanceStore.getState().getInstance(id)?.name).toBe('a')
    expect(useInstanceStore.getState().getInstance('does-not-exist')).toBeUndefined()
  })

  it('reorderInstances reassigns sortOrder and sorts by the given order', () => {
    const id1 = useInstanceStore.getState().addInstance(newInstanceData({ name: 'a' }))
    const id2 = useInstanceStore.getState().addInstance(newInstanceData({ name: 'b' }))
    const id3 = useInstanceStore.getState().addInstance(newInstanceData({ name: 'c' }))

    useInstanceStore.getState().reorderInstances([id3, id2, id1])
    const instances = useInstanceStore.getState().instances
    expect(instances.map((i) => i.id)).toEqual([id3, id2, id1])
    expect(instances.map((i) => i.sortOrder)).toEqual([1, 2, 3])
  })
})

describe('instanceStore — importInstances', () => {
  it('merge mode keeps existing instances and adds new ones', () => {
    useInstanceStore.getState().addInstance(newInstanceData({ name: 'existing' }))
    const result = useInstanceStore
      .getState()
      .importInstances(JSON.stringify([validImportItem()]), 'merge')
    expect(result).toEqual({ added: 1, skipped: 0 })
    expect(useInstanceStore.getState().instances).toHaveLength(2)
  })

  it('replace mode discards existing instances', () => {
    useInstanceStore.getState().addInstance(newInstanceData({ name: 'existing' }))
    const result = useInstanceStore
      .getState()
      .importInstances(JSON.stringify([validImportItem()]), 'replace')
    expect(result).toEqual({ added: 1, skipped: 0 })
    const instances = useInstanceStore.getState().instances
    expect(instances).toHaveLength(1)
    expect(instances[0].id).toBe('imp-1')
  })

  it('deduplicates by id (skips items whose id already exists)', () => {
    useInstanceStore.getState().addInstance(newInstanceData({ name: 'existing' }))
    const existingId = useInstanceStore.getState().instances[0].id
    const result = useInstanceStore
      .getState()
      .importInstances(
        JSON.stringify([validImportItem({ id: existingId, name: 'different-name' })]),
        'merge',
      )
    expect(result).toEqual({ added: 0, skipped: 1 })
  })

  it('deduplicates by name (skips items whose name already exists)', () => {
    useInstanceStore.getState().addInstance(newInstanceData({ name: 'existing' }))
    const result = useInstanceStore
      .getState()
      .importInstances(
        JSON.stringify([validImportItem({ id: 'other-id', name: 'existing' })]),
        'merge',
      )
    expect(result).toEqual({ added: 0, skipped: 1 })
  })

  it('skips malformed entries with an invalid baseUrl', () => {
    const result = useInstanceStore
      .getState()
      .importInstances(JSON.stringify([validImportItem({ baseUrl: 'not-a-url' })]), 'merge')
    expect(result).toEqual({ added: 0, skipped: 1 })
  })

  it('skips malformed entries missing the id', () => {
    const result = useInstanceStore
      .getState()
      .importInstances(JSON.stringify([{ name: 'x', baseUrl: 'http://x', secret: '' }]), 'merge')
    expect(result).toEqual({ added: 0, skipped: 1 })
  })

  it('skips malformed entries with an empty name', () => {
    const result = useInstanceStore
      .getState()
      .importInstances(JSON.stringify([validImportItem({ name: '' })]), 'merge')
    expect(result).toEqual({ added: 0, skipped: 1 })
  })

  it('non-array JSON returns {added:0, skipped:0}', () => {
    expect(useInstanceStore.getState().importInstances('{"foo":"bar"}')).toEqual({
      added: 0,
      skipped: 0,
    })
    expect(useInstanceStore.getState().importInstances('"hello"')).toEqual({
      added: 0,
      skipped: 0,
    })
    expect(useInstanceStore.getState().importInstances('42')).toEqual({ added: 0, skipped: 0 })
  })

  it('unparseable JSON returns {added:0, skipped:0}', () => {
    expect(useInstanceStore.getState().importInstances('{not valid json')).toEqual({
      added: 0,
      skipped: 0,
    })
  })

  it('imports multiple valid items in one call', () => {
    const result = useInstanceStore
      .getState()
      .importInstances(
        JSON.stringify([
          validImportItem({ id: 'a', name: 'a' }),
          validImportItem({ id: 'b', name: 'b' }),
        ]),
        'merge',
      )
    expect(result).toEqual({ added: 2, skipped: 0 })
  })

  it('counts valid and malformed items separately in a mixed batch', () => {
    const result = useInstanceStore
      .getState()
      .importInstances(
        JSON.stringify([
          validImportItem({ id: 'a', name: 'a' }),
          validImportItem({ id: 'b', name: 'b', baseUrl: 'bad' }),
        ]),
        'merge',
      )
    expect(result).toEqual({ added: 1, skipped: 1 })
  })
})

describe('instanceStore — exportInstances', () => {
  it('strips secrets by default', () => {
    useInstanceStore.getState().addInstance(newInstanceData({ name: 'a' }))
    const exported = JSON.parse(useInstanceStore.getState().exportInstances()) as Array<
      Record<string, unknown>
    >
    expect(exported[0].secret).toBeUndefined()
  })

  it('includes secrets when explicitly requested', () => {
    useInstanceStore.getState().addInstance(newInstanceData({ name: 'a', secret: 'keep-me' }))
    const exported = JSON.parse(useInstanceStore.getState().exportInstances(true)) as Array<
      Record<string, unknown>
    >
    expect(exported[0].secret).toBe('keep-me')
  })
})

describe('instanceStore — clearAll', () => {
  it('clears instances, probe state, and both storages', () => {
    useInstanceStore.getState().addInstance(newInstanceData({ name: 'a', secret: 's1' }))
    useInstanceStore.getState().addInstance(newInstanceData({ name: 'b', secret: 's2' }))
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy()
    expect(localStorage.getItem(SECRETS_STORAGE_KEY)).toBeTruthy()

    useInstanceStore.getState().clearAll()

    expect(useInstanceStore.getState().instances).toHaveLength(0)
    expect(useInstanceStore.getState().probing).toEqual({})
    expect(useInstanceStore.getState().probeErrors).toEqual({})

    const localParsed = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    expect(localParsed).toEqual([])
    const secretsParsed = JSON.parse(localStorage.getItem(SECRETS_STORAGE_KEY) as string)
    expect(secretsParsed).toEqual({})
  })
})

describe('instanceStore — probe state', () => {
  it('setProbeResult ok=true clears the error and stamps lastConnectedAt/lastKnownInfo', () => {
    const id = useInstanceStore.getState().addInstance(newInstanceData({ name: 'a' }))
    const info = { name: 'CoreC', version: '1.0.0', status: 'ok' }

    useInstanceStore.getState().setProbeResult(id, true, info)

    const inst = useInstanceStore.getState().getInstance(id)
    expect(inst?.lastConnectedAt).toBeTruthy()
    expect(inst?.lastKnownInfo).toEqual(info)
    expect(useInstanceStore.getState().probeErrors[id]).toBeNull()
  })

  it('setProbeResult ok=false records the supplied error message', () => {
    const id = useInstanceStore.getState().addInstance(newInstanceData({ name: 'a' }))
    useInstanceStore.getState().setProbeResult(id, false, undefined, 'connection refused')

    expect(useInstanceStore.getState().probeErrors[id]).toBe('connection refused')
    expect(useInstanceStore.getState().getInstance(id)?.lastConnectedAt).toBeUndefined()
  })

  it('setProbeResult ok=false defaults the error to "Connection failed"', () => {
    const id = useInstanceStore.getState().addInstance(newInstanceData({ name: 'a' }))
    useInstanceStore.getState().setProbeResult(id, false)

    expect(useInstanceStore.getState().probeErrors[id]).toBe('Connection failed')
  })

  it('setProbing toggles the probing flag for an instance', () => {
    const id = useInstanceStore.getState().addInstance(newInstanceData({ name: 'a' }))
    useInstanceStore.getState().setProbing(id, true)
    expect(useInstanceStore.getState().probing[id]).toBe(true)
    useInstanceStore.getState().setProbing(id, false)
    expect(useInstanceStore.getState().probing[id]).toBe(false)
  })
})

describe('instanceStore — loadInstances resilience', () => {
  it('tolerates corrupted localStorage JSON without throwing', async () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')
    vi.resetModules()
    const { useInstanceStore: freshStore } = await import('@/stores/instanceStore')
    expect(freshStore.getState().instances).toEqual([])
  })

  it('tolerates non-array localStorage content without throwing', async () => {
    localStorage.setItem(STORAGE_KEY, '{"foo":"bar"}')
    vi.resetModules()
    const { useInstanceStore: freshStore } = await import('@/stores/instanceStore')
    expect(freshStore.getState().instances).toEqual([])
  })

  it('merges secrets back from localStorage on load', async () => {
    // Seed metadata (no secret) and a secret map in localStorage,
    // then reload the module so loadInstances() re-runs.
    const id = 'persisted-id'
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id,
          name: 'persisted',
          baseUrl: 'http://x:9090',
          sortOrder: 1,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ]),
    )
    localStorage.setItem(SECRETS_STORAGE_KEY, JSON.stringify({ [id]: 'restored-secret' }))
    vi.resetModules()
    const { useInstanceStore: freshStore } = await import('@/stores/instanceStore')
    const instances = freshStore.getState().instances
    expect(instances).toHaveLength(1)
    expect(instances[0].id).toBe(id)
    expect(instances[0].secret).toBe('restored-secret')
  })
})
