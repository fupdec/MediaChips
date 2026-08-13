import {describe, expect, it} from 'vitest'
import {filterItems, parseItemsFromDb} from './filterItems'
import type {ParsedItem} from '../../app/types/items'

function item(partial: Partial<ParsedItem> & {id: number}): ParsedItem {
  return {
    path: `/m${partial.id}.mp4`,
    name: `m${partial.id}.mp4`,
    basename: `m${partial.id}`,
    ext: 'mp4',
    filesize: 100,
    tags: [],
    values: [],
    key: String(partial.id),
    ...partial,
  } as ParsedItem
}

describe('filterItems', () => {
  it('parses concatenated tag/value rows from DB', () => {
    const parsed = parseItemsFromDb([
      {
        id: 1,
        media_tags: '10^2,11^2',
        media_values: 'hello^3',
      } as never,
    ])
    expect(parsed[0].tags).toEqual([
      {tagId: 10, metaId: 2},
      {tagId: 11, metaId: 2},
    ])
    expect(parsed[0].values).toEqual([{value: 'hello', metaId: 3}])
  })

  it('filters by rating and sorts ascending', () => {
    const items = [
      item({id: 1, rating: 2}),
      item({id: 2, rating: 5}),
      item({id: 3, rating: 4}),
    ]
    const filtered = filterItems(
      [{param: 'rating', type: 'rating', cond: '>=', val: 4, active: true}],
      'media',
      items,
      'rating',
      'asc',
      false,
    )
    expect(filtered.map((row) => row.id)).toEqual([3, 2])
  })

  it('matches tag array filters', () => {
    const items = [
      item({id: 1, tags: [{tagId: 10, metaId: 2}]}),
      item({id: 2, tags: [{tagId: 11, metaId: 2}]}),
    ]
    const filtered = filterItems(
      [{param: 2, type: 'array', cond: 'in', val: [10], active: true}],
      'media',
      items,
      'id',
      'asc',
      false,
    )
    expect(filtered.map((row) => row.id)).toEqual([1])
  })

  it('ORs filter rows when filtersJoin is or', () => {
    const items = [
      item({id: 1, rating: 5, favorite: true}),
      item({id: 2, rating: 1, favorite: false}),
      item({id: 3, rating: 1, favorite: true}),
    ]
    const filtered = filterItems(
      [
        {param: 'rating', type: 'rating', cond: '>=', val: 5, active: true},
        {param: 'favorite', type: 'boolean', cond: '=', val: true, active: true},
      ],
      'media',
      items,
      'id',
      'asc',
      false,
      'filesize',
      null,
      'or',
    )
    expect(filtered.map((row) => row.id)).toEqual([1, 3])
  })
})
