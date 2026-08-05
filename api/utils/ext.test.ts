/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {normalizeExt, parseExtList, serializeExtList} from './ext'

describe('normalizeExt', () => {
  it.each([
    [null, null],
    [undefined, null],
    ['', null],
    ['   ', null],
    ['mp4', '.mp4'],
    ['.MP4', '.mp4'],
    ['  .Mov  ', '.mov'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeExt(input)).toBe(expected)
  })
})

describe('parseExtList', () => {
  it('returns empty for nullish/blank', () => {
    expect(parseExtList(null)).toEqual([])
    expect(parseExtList(undefined)).toEqual([])
    expect(parseExtList('')).toEqual([])
  })

  it('parses CSV and drops empties', () => {
    expect(parseExtList('mp4, avi,,.mkv')).toEqual(['.mp4', '.avi', '.mkv'])
  })

  it('normalizes array entries', () => {
    expect(parseExtList(['MP4', '.Avi', '', null as never])).toEqual(['.mp4', '.avi'])
  })
})

describe('serializeExtList', () => {
  it('joins normalized extensions', () => {
    expect(serializeExtList(['mp4', '.AVI'])).toBe('.mp4,.avi')
    expect(serializeExtList('mov, mkv')).toBe('.mov,.mkv')
  })

  it('round-trips CSV through parse/serialize', () => {
    const serialized = serializeExtList('mp4, avi')
    expect(serialized).toBe('.mp4,.avi')
    expect(parseExtList(serialized)).toEqual(['.mp4', '.avi'])
  })
})
