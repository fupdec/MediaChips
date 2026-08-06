import {describe, expect, it, vi} from 'vitest'
import {loserPathsToUnlink, maybeUnlinkMergedLoserFiles} from './mediaMerge'

describe('mediaMerge disk cleanup', () => {
  it('collects real loser paths and skips virtual ZIP entries', () => {
    expect(loserPathsToUnlink([
      {path: '/media/a.mp4'},
      {path: '/media/album.zip!/page.jpg'},
      {path: ''},
      {path: null},
      {path: '/media/b.mp4'},
    ])).toEqual([
      '/media/a.mp4',
      '/media/b.mp4',
    ])
  })

  it('does not unlink when withFile is false', async () => {
    const unlink = vi.fn(async () => true)
    await maybeUnlinkMergedLoserFiles(false, [{path: '/media/a.mp4'}], unlink)
    expect(unlink).not.toHaveBeenCalled()
  })

  it('unlinks real loser paths when withFile is true', async () => {
    const unlink = vi.fn(async () => true)
    await maybeUnlinkMergedLoserFiles(true, [
      {path: '/media/a.mp4'},
      {path: '/media/album.zip!/page.jpg'},
      {path: '/media/b.mp4'},
    ], unlink)

    expect(unlink).toHaveBeenCalledTimes(2)
    expect(unlink).toHaveBeenCalledWith('/media/a.mp4')
    expect(unlink).toHaveBeenCalledWith('/media/b.mp4')
  })
})
