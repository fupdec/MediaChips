/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildMediaPathUnderFolderSql,
  buildMediaTagArrayJoinResult,
  buildMediaTagArrayFilterClause,
} from './mediaTagFilterSql'

describe('buildMediaPathUnderFolderSql', () => {
  it('normalizes separators for path prefix matching', () => {
    const sql = buildMediaPathUnderFolderSql('media.path', 'fp.path')
    expect(sql).toContain("REPLACE(media.path, '\\', '/')")
    expect(sql).toContain("RTRIM(REPLACE(fp.path, '\\', '/'), '/') || '/%'")
  })
})

describe('buildMediaTagArrayJoinResult', () => {
  const nextParam = (() => {
    let index = 0
    return (value: unknown) => {
      const key = `:p${index}`
      index += 1
      void value
      return key
    }
  })()

  it('includes folder inheritance for in-filter', () => {
    const result = buildMediaTagArrayJoinResult(
      {cond: 'in', val: [7]},
      'tf0',
      ':meta',
      nextParam,
    )

    expect(typeof result).toBe('string')
    expect(String(result)).toContain('tagsInMedia')
    expect(String(result)).toContain('tagsInFolders')
    expect(String(result)).toContain('folderPaths')
    expect(String(result)).toContain('UNION')
  })

  it('builds not in as anti-join over direct and inherited tags', () => {
    const result = buildMediaTagArrayJoinResult(
      {cond: 'not in', val: [1, 2]},
      'tf0',
      ':meta',
      (() => {
        let index = 0
        return (value: unknown) => {
          const key = `:n${index}`
          index += 1
          void value
          return key
        }
      })(),
    )

    expect(result).toEqual(expect.objectContaining({
      where: 'tf0.mediaId IS NULL',
    }))
    expect((result as {join: string}).join).toContain('tagsInFolders')
  })
})

describe('buildMediaTagArrayFilterClause', () => {
  it('requires all tags via direct or folder inheritance for in all', () => {
    let index = 0
    const nextParam = (value: unknown) => {
      const key = `:c${index}`
      index += 1
      void value
      return key
    }

    const clause = buildMediaTagArrayFilterClause(':meta', {
      cond: 'in all',
      val: [3, 4],
    }, nextParam)

    expect(clause).toContain('HAVING COUNT(DISTINCT tagId)')
    expect(clause).toContain('tagsInFolders')
    expect(clause).toContain('UNION')
  })
})
