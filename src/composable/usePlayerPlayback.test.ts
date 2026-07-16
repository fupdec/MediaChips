import {describe, it, expect, vi} from 'vitest'
import {
  resolvePlayableVideo,
  isLoadSrcSessionStale,
  getLiveChunkRelativeTime,
} from '@/composable/usePlayerPlayback'
import type { MediaItem } from '@/types/stores'

describe('isLoadSrcSessionStale', () => {
  it('detects stale session id', () => {
    expect(isLoadSrcSessionStale(1, 2, true)).toBe(true)
    expect(isLoadSrcSessionStale(2, 2, true)).toBe(false)
  })

  it('detects inactive player', () => {
    expect(isLoadSrcSessionStale(2, 2, false)).toBe(true)
  })
})

describe('getLiveChunkRelativeTime', () => {
  it('returns offset inside the live chunk', () => {
    // 11:10 mark inside a chunk that starts at 11:00
    expect(getLiveChunkRelativeTime(670, 660)).toBe(10)
    expect(getLiveChunkRelativeTime(660, 660)).toBe(0)
    expect(getLiveChunkRelativeTime(659, 660)).toBe(0)
  })

  it('matches the 26:45 mark / 30s chunk boundary case', () => {
    // 26:45 = 1605; floor chunk would be 1590 (=26:30) — 15s early without exact start
    expect(getLiveChunkRelativeTime(1605, 1590)).toBe(15)
    expect(getLiveChunkRelativeTime(1605, 1605)).toBe(0)
  })
})

describe('resolvePlayableVideo', () => {
  const playlist: MediaItem[] = [
    {id: 1, path: '/missing.mp4'},
    {id: 2, path: '/available.mp4'},
  ]

  it('returns first playable file from playlist', async () => {
    const checkFileExists = vi.fn(async (filePath: string) => filePath === '/available.mp4')

    await expect(resolvePlayableVideo(playlist, playlist[0], checkFileExists))
      .resolves.toEqual({video: playlist[1], index: 1})
  })

  it('falls back to initial video when no file exists on disk', async () => {
    const checkFileExists = vi.fn(async () => false)

    await expect(resolvePlayableVideo(playlist, playlist[0], checkFileExists))
      .resolves.toEqual({video: playlist[0], index: 0})
  })

  it('returns null without initial video id', async () => {
    const checkFileExists = vi.fn(async () => false)

    await expect(resolvePlayableVideo([], {} as MediaItem, checkFileExists)).resolves.toBeNull()
  })

  it('resolves duplicate media ids by playlist key', async () => {
    const clipPlaylist: MediaItem[] = [
      {id: 1, path: '/same.mp4', key: 'clip-1', markId: 1, segmentStart: 0, segmentEnd: 5},
      {id: 1, path: '/same.mp4', key: 'clip-2', markId: 2, segmentStart: 10, segmentEnd: 20},
    ]
    const checkFileExists = vi.fn(async () => true)

    await expect(resolvePlayableVideo(clipPlaylist, clipPlaylist[1], checkFileExists))
      .resolves.toEqual({video: clipPlaylist[1], index: 1})
  })
})
