import { describe, expect, it } from 'vitest'
import {
  canAssignMetaToScraperField,
  resolveAssignmentMetaId,
  resolveAssignmentMetaType,
} from './scraperFieldMapping'

describe('scraperFieldMapping', () => {
  it('resolves meta id from assignment row', () => {
    expect(resolveAssignmentMetaId({ metaId: 17 })).toBe(17)
    expect(resolveAssignmentMetaId({ meta: { id: 18, type: 'array' } })).toBe(18)
  })

  it('resolves meta type from nested meta or catalog', () => {
    expect(resolveAssignmentMetaType({ meta: { id: 1, type: 'array' } })).toBe('array')
    expect(resolveAssignmentMetaType(
      { metaId: 2 },
      [{ id: 2, type: 'date' }],
    )).toBe('date')
  })

  it('checks scraper field compatibility', () => {
    const item = { metaId: 3, meta: { id: 3, type: 'array' } }
    expect(canAssignMetaToScraperField(item, 'array')).toBe(true)
    expect(canAssignMetaToScraperField(item, 'string')).toBe(false)
  })
})
