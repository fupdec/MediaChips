import {describe, expect, it, vi} from 'vitest'
const queue = vi.hoisted(() => vi.fn())
vi.mock('./mediaCopyPaths', () => ({queueMediaCopyPaths: queue}))
vi.mock('./fileService', () => ({checkFileExists: vi.fn()}))
vi.mock('@/services/typedApi/mediaCopies', () => ({mediaCopiesApi: {list: vi.fn()}}))
import {isMediaFileAvailable} from './mediaCopyAvailability'

describe('grid copy availability', () => {
  it('does not load copies when the original exists', async () => {
    queue.mockClear()
    expect(await isMediaFileAvailable({id: 1, path: '/original', hasCopies: true}, async () => true)).toBe(true)
    expect(queue).not.toHaveBeenCalled()
  })
  it('checks local copies when the original is missing', async () => {
    queue.mockResolvedValue(['/backup'])
    expect(await isMediaFileAvailable({id: 1, path: '/original', hasCopies: true}, async path => path === '/backup')).toBe(true)
  })
  it('keeps remote copies available without probing their files', async () => {
    queue.mockResolvedValue(['nas://00000000-0000-0000-0000-000000000001/video.mp4'])
    const exists = vi.fn(async () => false)
    expect(await isMediaFileAvailable({id: 1, path: '/original', hasCopies: true}, exists)).toBe(true)
    expect(exists).toHaveBeenCalledTimes(1)
  })
})
