import {describe, expect, it} from 'vitest'
import {normalizeFilterRow} from './normalizeFilterRow'

describe('normalizeFilterRow', () => {
  it('coerces active flags and number values', () => {
    expect(normalizeFilterRow({
      type: 'number',
      val: '12',
      active: '1',
    } as never)).toMatchObject({
      val: 12,
      active: true,
    })
  })

  it('hydrates array tags and parses country/ext', () => {
    const tagsByRowId = new Map([[5, [{tagId: 9}, {tagId: 8}]]])
    expect(normalizeFilterRow({
      id: 5,
      type: 'array',
      param: 'people',
    } as never, tagsByRowId as never).val).toEqual([9, 8])

    expect(normalizeFilterRow({
      param: 'ext',
      val: 'mp4,mkv',
    } as never).val).toEqual(expect.arrayContaining(['.mp4', '.mkv']))
  })
})
