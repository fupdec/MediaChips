import {describe, expect, it} from 'vitest'
import {
  bucketFilesByMediaType,
  combineMediaTypeExtensions,
  resolveTargetMediaTypesForAdding,
} from '@/utils/mediaType'
import type {MediaType} from '@/types/media'

const types = [
  {id: 1, type: 'video', name: 'Videos', extensions: 'mp4,mkv', order: 1, hidden: false},
  {id: 2, type: 'image', name: 'Images', extensions: 'jpg,png', order: 2, hidden: false},
  {id: 3, type: 'audio', name: 'Audio', extensions: 'mp3', order: 3, hidden: false},
] as MediaType[]

describe('resolveTargetMediaTypesForAdding', () => {
  it('returns all managed types when selection is empty', () => {
    expect(resolveTargetMediaTypesForAdding(types, []).map((item) => item.id)).toEqual([1, 2, 3])
    expect(resolveTargetMediaTypesForAdding(types, null).map((item) => item.id)).toEqual([1, 2, 3])
  })

  it('filters to selected ids', () => {
    expect(resolveTargetMediaTypesForAdding(types, [2]).map((item) => item.id)).toEqual([2])
  })
})

describe('bucketFilesByMediaType', () => {
  it('assigns files by extension', () => {
    const buckets = bucketFilesByMediaType([
      '/a/x.mp4',
      '/a/y.jpg',
      '/a/z.mp3',
      '/a/skip.txt',
    ], types)
    expect(buckets.get(1)).toEqual(['/a/x.mp4'])
    expect(buckets.get(2)).toEqual(['/a/y.jpg'])
    expect(buckets.get(3)).toEqual(['/a/z.mp3'])
  })
})

describe('combineMediaTypeExtensions', () => {
  it('unions extensions', () => {
    expect(combineMediaTypeExtensions(types)).toContain('mp4')
    expect(combineMediaTypeExtensions(types)).toContain('jpg')
    expect(combineMediaTypeExtensions(types)).toContain('mp3')
  })
})
