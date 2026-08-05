import {describe, expect, it} from 'vitest'
import {addToSizeBasenameIndex, sizeBasenameKey} from './scanFolderDuplicateIndex'

describe('scanFolderDuplicateIndex', () => {
  it('builds size+basename keys and buckets', () => {
    expect(sizeBasenameKey(10, 'Clip.MP4')).toBe('10::clip.mp4')
    const index = new Map<string, Array<{id: number}>>()
    addToSizeBasenameIndex(index, 10, 'a.mp4', {id: 1})
    addToSizeBasenameIndex(index, 10, 'A.MP4', {id: 2})
    expect(index.get('10::a.mp4')?.map((x) => x.id)).toEqual([1, 2])
  })
})
