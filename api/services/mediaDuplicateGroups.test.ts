import {describe, expect, it} from 'vitest'
import {
  buildExactDuplicateGroupsSql,
  isVisualDuplicatesMode,
  parseGroupedIdCsv,
} from './mediaDuplicateGroups'

describe('mediaDuplicateGroups', () => {
  it('detects visual modes', () => {
    expect(isVisualDuplicatesMode('visualHash')).toBe(true)
    expect(isVisualDuplicatesMode('visual')).toBe(true)
    expect(isVisualDuplicatesMode('fingerprint')).toBe(false)
  })

  it('parses grouped id csv', () => {
    expect(parseGroupedIdCsv('3,1,1,2')).toEqual([3, 1, 2])
    expect(parseGroupedIdCsv('')).toEqual([])
  })

  it('builds exact group SQL with media type scope', () => {
    const sql = buildExactDuplicateGroupsSql('fingerprint', true)
    expect(sql).toContain('media.oshash AS dupVal')
    expect(sql).toContain('media.mediaTypeId = :mediaTypeId')
    expect(sql).toContain('HAVING COUNT(*) > 1')
    expect(sql).toContain('GROUP_CONCAT(id)')
  })

  it('builds filesize group SQL without media type', () => {
    const sql = buildExactDuplicateGroupsSql('filesize', false)
    expect(sql).toContain('media.filesize AS dupVal')
    expect(sql).toContain('media.filesize > 0')
    expect(sql).not.toContain('mediaTypeId')
  })
})
