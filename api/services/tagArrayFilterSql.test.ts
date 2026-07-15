/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildTagArrayFilterClause,
  buildTagArrayJoinResult,
  MEDIA_TAG_LINK,
  TAG_RELATION_LINK,
} from './tagArrayFilterSql'

describe('buildTagArrayJoinResult', () => {
  it('builds anti-join for not in (excludes one of)', () => {
    const result = buildTagArrayJoinResult(
      MEDIA_TAG_LINK,
      { cond: 'not in', val: [1, 2] },
      'tf0',
      ':meta',
      (value) => `:${String(value)}`,
    )

    expect(result).toMatchObject({
      join: expect.stringContaining('LEFT JOIN'),
      where: 'tf0.mediaId IS NULL',
    })
    if (!result || typeof result === 'string') return

    expect(result.join).toContain('SELECT DISTINCT mediaId')
    expect(result.join).not.toContain('NOT EXISTS')
  })

  it('builds anti-join for not in all (excludes all)', () => {
    const result = buildTagArrayJoinResult(
      MEDIA_TAG_LINK,
      { cond: 'not in all', val: [1, 2] },
      'tf0',
      ':meta',
      (value) => `:${String(value)}`,
    )

    expect(result).toMatchObject({
      join: expect.stringContaining('HAVING COUNT(DISTINCT tagId)'),
      where: 'tf0.mediaId IS NULL',
    })
  })

  it('builds inner join for in only', () => {
    const result = buildTagArrayJoinResult(
      TAG_RELATION_LINK,
      { cond: 'in only', val: [5] },
      'tf0',
      ':meta',
      (value) => `:${String(value)}`,
    )

    expect(typeof result).toBe('string')
    if (typeof result !== 'string') return

    expect(result).toContain('INNER JOIN')
    expect(result).toContain('COUNT(DISTINCT CASE WHEN tagId IN')
  })
})

describe('buildTagArrayFilterClause', () => {
  it('uses non-correlated NOT IN for not in fallback', () => {
    const clause = buildTagArrayFilterClause(
      MEDIA_TAG_LINK,
      ':meta',
      { cond: 'not in', val: [3] },
      (value) => `:${String(value)}`,
    )

    expect(clause).toContain('media.id NOT IN')
    expect(clause).toContain('SELECT DISTINCT mediaId')
    expect(clause).not.toContain('NOT EXISTS')
  })

  it('uses non-correlated IN for is null and not null', () => {
    const emptyClause = buildTagArrayFilterClause(
      MEDIA_TAG_LINK,
      ':meta',
      { cond: 'is null', val: [] },
      (value) => `:${String(value)}`,
    )
    const filledClause = buildTagArrayFilterClause(
      MEDIA_TAG_LINK,
      ':meta',
      { cond: 'not null', val: [] },
      (value) => `:${String(value)}`,
    )

    expect(emptyClause).toContain('NOT IN')
    expect(filledClause).toContain(' IN (')
    expect(emptyClause).not.toContain('EXISTS')
    expect(filledClause).not.toContain('EXISTS')
  })
})
