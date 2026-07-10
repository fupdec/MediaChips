/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import orderBy from 'lodash/orderBy'
import type { ParsedItem } from '../../app/types/items'
import {
  buildMediaMetaSortExpression,
  buildTagMetaSortExpression,
  getItemMetaSortValue,
  getItemSortIteratee,
} from './metaValueSort'

describe('metaValueSort', () => {
  it('builds numeric SQL sort expression for media meta values', () => {
    const expr = buildMediaMetaSortExpression(42, 'number')
    expect(expr).toContain('valuesInMedia')
    expect(expr).toContain('metaId = 42')
    expect(expr).toContain('CAST(')
    expect(expr).toContain('AS REAL')
  })

  it('builds tag meta sort expression', () => {
    const expr = buildTagMetaSortExpression(7, 'rating')
    expect(expr).toContain('valuesInTags')
    expect(expr).toContain('metaId = 7')
    expect(expr).toContain('AS REAL')
  })

  it('sorts number meta values numerically in legacy orderBy', () => {
    const items: ParsedItem[] = [
      {id: 1, tags: [], values: [{metaId: 5, value: '10'}], key: '1'},
      {id: 2, tags: [], values: [{metaId: 5, value: '2'}], key: '2'},
      {id: 3, tags: [], values: [{metaId: 5, value: '11'}], key: '3'},
      {id: 4, tags: [], values: [{metaId: 5, value: '1'}], key: '4'},
    ]

    const stringSorted = orderBy(items, [getItemSortIteratee('5')], ['asc'])
    expect(stringSorted.map((item) => item.id)).toEqual([1, 2, 3, 4])

    const numericSorted = orderBy(items, [getItemSortIteratee('5', 'number')], ['asc'])
    expect(numericSorted.map((item) => item.id)).toEqual([4, 2, 1, 3])
  })

  it('uses defaults for missing meta values', () => {
    const item: ParsedItem = {id: 1, tags: [], values: [], key: '1'}
    expect(getItemMetaSortValue(item, 9, 'number')).toBe(0)
    expect(getItemMetaSortValue(item, 9, 'string')).toBe('')
    expect(getItemMetaSortValue(item, 9, 'boolean')).toBe(0)
  })
})
