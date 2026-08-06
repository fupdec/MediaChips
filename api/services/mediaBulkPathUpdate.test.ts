/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {
  buildBulkPathUpdatePatch,
  normalizeBulkPathUpdateInputs,
} from './mediaBulkPathUpdate'

describe('mediaBulkPathUpdate', () => {
  it('normalizes valid id/path pairs', () => {
    expect(normalizeBulkPathUpdateInputs([
      {id: 1, path: '/a/b.mp4'},
      {id: 0, path: '/skip.mp4'},
      {id: 2, path: ''},
      {id: 3, path: '/c/d.mkv'},
    ])).toEqual([
      {id: 1, path: '/a/b.mp4'},
      {id: 3, path: '/c/d.mkv'},
    ])
  })

  it('preserves custom names when only the directory changes', () => {
    expect(buildBulkPathUpdatePatch(
      {id: 1, path: '/new/dir/clip.mp4'},
      {path: '/old/dir/clip.mp4', name: 'My Clip'},
    )).toMatchObject({
      id: 1,
      path: '/new/dir/clip.mp4',
      basename: 'clip.mp4',
      name: 'My Clip',
      ext: '.mp4',
    })
  })

  it('repairs path-like display names', () => {
    expect(buildBulkPathUpdatePatch(
      {id: 2, path: '/new/dir/clip.mp4'},
      {path: '/old/dir/clip.mp4', name: '/old/dir/clip.mp4'},
    ).name).toBe('clip')
  })

  it('uses parsed stem when the file name changes', () => {
    expect(buildBulkPathUpdatePatch(
      {id: 3, path: '/dir/renamed.mp4'},
      {path: '/dir/clip.mp4', name: 'My Clip'},
    ).name).toBe('renamed')
  })
})
