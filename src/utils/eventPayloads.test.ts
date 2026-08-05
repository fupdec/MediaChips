import {describe, expect, it} from 'vitest'
import {normalizeEntityIds, normalizeRemoveEntitiesEvent} from './eventPayloads'

describe('normalizeRemoveEntitiesEvent', () => {
  it('reads detail or direct payload', () => {
    expect(normalizeRemoveEntitiesEvent({detail: {ids: [1], type: 'media'}} as never))
      .toEqual({ids: [1], type: 'media'})
    expect(normalizeRemoveEntitiesEvent({ids: [2], type: 'tag'} as never))
      .toEqual({ids: [2], type: 'tag'})
    expect(normalizeRemoveEntitiesEvent(undefined)).toBeNull()
    expect(normalizeRemoveEntitiesEvent({} as never)).toBeNull()
  })
})

describe('normalizeEntityIds', () => {
  it('coerces finite ids and preserves empty arrays', () => {
    expect(normalizeEntityIds(['1', 2, 'x', undefined])).toEqual([1, 2])
    expect(normalizeEntityIds([])).toEqual([])
    expect(normalizeEntityIds(undefined)).toBeUndefined()
  })
})
