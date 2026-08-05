import {describe, expect, it} from 'vitest'
import {
  buildEntityIdSelect,
  buildFilteredCountSql,
  buildFilteredTotalsSql,
  buildMediaIdSelect,
  buildTagIdSelect,
} from './filteredListSql'

describe('filteredListSql', () => {
  it('builds id selects with optional DISTINCT', () => {
    expect(buildEntityIdSelect('media.id', false)).toBe('SELECT media.id')
    expect(buildMediaIdSelect(true)).toBe('SELECT DISTINCT media.id')
    expect(buildTagIdSelect(false)).toBe('SELECT tags.id')
  })

  it('builds count SQL without DISTINCT', () => {
    const sql = buildFilteredCountSql('FROM media', 'WHERE 1=1', false)
    expect(sql).toContain('SELECT COUNT(*) AS totalFiltered')
    expect(sql).toContain('FROM media')
    expect(sql).not.toContain('DISTINCT')
  })

  it('builds count SQL with DISTINCT subquery', () => {
    const sql = buildFilteredCountSql('FROM tags', 'WHERE tags.metaId = :metaId', true, 'tags.id')
    expect(sql).toContain('SELECT DISTINCT tags.id')
    expect(sql).toContain('FROM (')
  })

  it('builds totals SQL with filesize sum', () => {
    const simple = buildFilteredTotalsSql('FROM media', 'WHERE 1=1', false)
    expect(simple).toContain('SUM(media.filesize)')
    expect(simple).not.toContain('DISTINCT')

    const distinct = buildFilteredTotalsSql('FROM media', 'WHERE 1=1', true)
    expect(distinct).toContain('SELECT DISTINCT media.id, media.filesize AS filesize')
    expect(distinct).toContain('SUM(filesize)')
  })
})
