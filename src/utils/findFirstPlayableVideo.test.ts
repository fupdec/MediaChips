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

  it('falls back to a usable copy only when the original is missing', async () => {
    const check = vi.fn(async () => false)
    const copy = vi.fn(async () => true)
    const videos = [{id: 1, path: '/gone.mp4', hasCopies: true}]
    await expect(findFirstPlayableVideo(videos, check, copy)).resolves.toEqual(videos[0])
    expect(copy).toHaveBeenCalledTimes(1)
  })

  it('does not consult copies when the original exists or there are no copies', async () => {
    const copy = vi.fn(async () => true)
    const present = [{id: 1, path: '/a.mp4', hasCopies: true}]
    await expect(findFirstPlayableVideo(present, async () => true, copy)).resolves.toEqual(present[0])
    await expect(findFirstPlayableVideo([{id: 2, path: '/b.mp4'}], async () => false, copy)).resolves.toBeNull()
    expect(copy).not.toHaveBeenCalled()
  })
})
