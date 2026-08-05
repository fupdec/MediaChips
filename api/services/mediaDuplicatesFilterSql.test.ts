import {describe, expect, it} from 'vitest'
import {
  buildDuplicateMatchClauses,
  buildDuplicateValuesSubquery,
  resolveDuplicateColumn,
} from './mediaDuplicatesFilterSql'

describe('mediaDuplicatesFilterSql', () => {
  it('maps duplicates_by aliases to columns', () => {
    expect(resolveDuplicateColumn('path')).toBe('path')
    expect(resolveDuplicateColumn('fingerprint')).toBe('oshash')
    expect(resolveDuplicateColumn('visual')).toBe('visualHash')
    expect(resolveDuplicateColumn('contentHash')).toBe('contentHash')
    expect(resolveDuplicateColumn('other')).toBe('filesize')
  })

  it('builds distinct duplicate-value subquery', () => {
    const sql = buildDuplicateValuesSubquery('oshash', '', 'media.mediaTypeId = :mediaTypeId')
    expect(sql).toContain('SELECT DISTINCT media.id AS id, media.oshash AS dupVal')
    expect(sql).toContain('HAVING COUNT(*) > 1')
  })

  it('builds match clauses for filesize and hash columns', () => {
    expect(buildDuplicateMatchClauses('filesize', 'SELECT 1')).toEqual([
      'media.filesize > 0',
      'media.filesize IN (SELECT 1)',
    ])
    expect(buildDuplicateMatchClauses('path', 'SELECT 1')[0]).toContain('media.path IS NOT NULL')
  })
})
