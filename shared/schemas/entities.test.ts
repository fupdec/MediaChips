import { describe, expect, it } from 'vitest'
import {
  parseMediaListResponse,
  parseMediaTypes,
  parseMetaList,
  parseSettings,
  parseTags,
} from '@shared/schemas'
import { FilterObjectSchema } from '@shared/schemas/entities'
import { ItemsListRequestSchema } from '@shared/schemas/requests'

describe('shared schemas', () => {
  it('parses media types', () => {
    const result = parseMediaTypes([{ id: 1, type: 'video', name: 'Videos' }])
    expect(result).toEqual([{ id: 1, type: 'video', name: 'Videos' }])
  })

  it('parses sqlite-style tag rows with null text fields', () => {
    expect(parseTags([{
      id: 2,
      name: 'Tag',
      metaId: 1,
      favorite: 0,
      synonyms: null,
      color: null,
      bookmark: null,
    }])).toEqual([{
      id: 2,
      name: 'Tag',
      metaId: 1,
      favorite: false,
      synonyms: undefined,
      color: undefined,
      bookmark: undefined,
    }])
  })

  it('parses tags and meta lists', () => {
    expect(parseTags([{ id: 2, name: 'Tag' }])).toEqual([{ id: 2, name: 'Tag' }])
    expect(parseMetaList([{ id: 3, name: 'Meta', type: 'array' }])).toEqual([
      { id: 3, name: 'Meta', type: 'array' },
    ])
  })

  it('parses sqlite-style meta rows with null text fields', () => {
    expect(parseMetaList([{ id: 4, name: null, type: 'array' }])).toEqual([
      { id: 4, name: undefined, type: 'array' },
    ])
  })

  it('parses sqlite-style media list rows with null numeric fields', () => {
    const result = parseMediaListResponse({
      items: [{ id: 10, name: 'clip.mp4', time: null, duration: null }],
      totalFiltered: null,
      totalFilesize: null,
      total: null,
    })
    expect(result.items?.[0]?.time).toBeUndefined()
    expect(result.totalFiltered).toBeUndefined()
  })

  it('parses settings entries', () => {
    expect(parseSettings([{ option: 'theme', value: 'dark' }])).toEqual([
      { option: 'theme', value: 'dark' },
    ])
  })

  it('parses media list responses', () => {
    const result = parseMediaListResponse({
      items: [{ id: 10, name: 'clip.mp4' }],
      totalFiltered: 1,
    })
    expect(result.totalFiltered).toBe(1)
    expect(result.items?.[0]?.id).toBe(10)
  })

  it('rejects invalid media type payloads', () => {
    expect(() => parseMediaTypes([{ id: 'bad' }])).toThrow()
  })

  it('coerces sqlite-style filter booleans', () => {
    const filter = FilterObjectSchema.parse({
      id: 1,
      param: 17,
      type: 'array',
      cond: 'in all',
      val: [717],
      note: null,
      active: 1,
      lock: 0,
    })
    expect(filter.active).toBe(true)
    expect(filter.lock).toBe(false)
  })

  it('accepts items list requests with legacy filter values', () => {
    const payload = ItemsListRequestSchema.parse({
      mediaTypeId: '1',
      page: '1',
      limit: 20,
      filters: [{
        id: 1,
        param: 17,
        type: 'array',
        cond: 'in all',
        val: [717],
        note: null,
        active: 1,
        lock: false,
        metaId: null,
      }],
      sortBy: 'createdAt',
      direction: 'desc',
      find_duplicates: 0,
    })
    expect(payload.mediaTypeId).toBe(1)
    expect(payload.filters?.[0]?.active).toBe(true)
    expect(payload.filters?.[0]?.metaId).toBeNull()
    expect(payload.find_duplicates).toBe(false)
  })
})
