import {describe, expect, it} from 'vitest'
import {buildExtArrayClause} from './extFilterSql'

function binder() {
  let n = 0
  return (value: unknown) => {
    n += 1
    return `:e${n}`
  }
}

describe('extFilterSql', () => {
  it('handles null/empty extension filters', () => {
    const nextParam = binder()
    expect(buildExtArrayClause({cond: 'is null', val: []}, nextParam)).toContain('media.ext IS NULL')
    expect(buildExtArrayClause({cond: 'in', val: []}, nextParam)).toBe('0 = 1')
    expect(buildExtArrayClause({cond: 'not in', val: []}, nextParam)).toBe('1 = 1')
  })

  it('builds IN / NOT IN lists for extensions', () => {
    const nextParam = binder()
    expect(buildExtArrayClause({cond: 'in', val: ['mp4', 'mkv']}, nextParam)).toBe(
      'LOWER(media.ext) IN (:e1, :e2)',
    )
    expect(buildExtArrayClause({cond: 'not in', val: ['avi']}, nextParam)).toContain('NOT IN')
  })

  it('builds in only as exact single-extension match', () => {
    const nextParam = binder()
    expect(buildExtArrayClause({cond: 'in only', val: ['mp4']}, nextParam)).toBe(
      'LOWER(media.ext) IN (:e1)',
    )
    expect(buildExtArrayClause({cond: 'in only', val: ['mp4', 'mkv']}, nextParam)).toBe('0 = 1')
    expect(buildExtArrayClause({cond: 'in only', val: []}, nextParam)).toBe('0 = 1')
  })
})
