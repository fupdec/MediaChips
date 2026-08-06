import {describe, expect, it, vi} from 'vitest'
import {findFirstPlayableVideo} from './findFirstPlayableVideo'

describe('findFirstPlayableVideo', () => {
  it('returns the first existing path and stops checking', async () => {
    const check = vi.fn(async (filePath: string) => filePath === '/b.mp4')
    const videos = [
      {id: 1, path: '/a.mp4'},
      {id: 2, path: '/b.mp4'},
      {id: 3, path: '/c.mp4'},
    ]

    await expect(findFirstPlayableVideo(videos, check)).resolves.toEqual(videos[1])
    expect(check).toHaveBeenCalledTimes(2)
    expect(check).toHaveBeenNthCalledWith(1, '/a.mp4')
    expect(check).toHaveBeenNthCalledWith(2, '/b.mp4')
  })

  it('skips entries without a path', async () => {
    const check = vi.fn(async () => true)
    const videos = [
      {id: 1, path: ''},
      {id: 2, path: '/ok.mp4'},
    ]
    await expect(findFirstPlayableVideo(videos, check)).resolves.toEqual(videos[1])
    expect(check).toHaveBeenCalledTimes(1)
    expect(check).toHaveBeenCalledWith('/ok.mp4')
  })

  it('returns null when nothing exists', async () => {
    const check = vi.fn(async () => false)
    await expect(findFirstPlayableVideo([{path: '/a.mp4'}, {path: '/b.mp4'}], check))
      .resolves.toBeNull()
    expect(check).toHaveBeenCalledTimes(2)
  })
})
