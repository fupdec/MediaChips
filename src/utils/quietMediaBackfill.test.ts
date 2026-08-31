import { beforeEach, describe, expect, it, vi } from 'vitest'

const ensureMediaMetadataBulk = vi.hoisted(() => vi.fn())
const refreshMediaFileInfo = vi.hoisted(() => vi.fn())
const refreshThumb = vi.hoisted(() => vi.fn())
const syncMediaFileInfo = vi.hoisted(() => vi.fn())
const pickMediaFileInfo = vi.hoisted(() => vi.fn((item: Record<string, unknown>) => item))
const invalidateCachedThumb = vi.hoisted(() => vi.fn())

vi.mock('@/services/typedApi', () => ({
  typedApi: {ensureMediaMetadataBulk},
}))

vi.mock('@/services/mediaFileInfoService', () => ({
  refreshMediaFileInfo,
  syncMediaFileInfo,
  pickMediaFileInfo,
}))

vi.mock('@/stores/items', () => ({
  useItemsStore: () => ({refreshThumb}),
}))

vi.mock('@/utils/thumbDisplayCache', () => ({
  invalidateCachedThumb,
  mediaThumbKey: (folder: string, id: number, sub?: string) =>
    sub ? `${folder}:${id}:${sub}` : `${folder}:${id}`,
}))

vi.mock('@/utils/imageThumbRegen', async () => {
  const actual = await vi.importActual<typeof import('./imageThumbRegen')>('./imageThumbRegen')
  return actual
})

import {
  enqueueImageThumbAndMeta,
  enqueueQuietMetaBackfill,
  enqueueQuietMetaBackfillMany,
  needsQuietMetaBackfill,
  resetQuietMediaBackfillForTests,
} from './quietMediaBackfill'
import { resetImageThumbRegenQueueForTests } from './imageThumbRegen'

describe('quietMediaBackfill', () => {
  beforeEach(() => {
    resetQuietMediaBackfillForTests()
    resetImageThumbRegenQueueForTests()
    ensureMediaMetadataBulk.mockReset()
    refreshMediaFileInfo.mockReset()
    refreshThumb.mockReset()
    syncMediaFileInfo.mockReset()
    pickMediaFileInfo.mockClear()
    invalidateCachedThumb.mockReset()
    refreshMediaFileInfo.mockResolvedValue({width: 100, height: 80})
    ensureMediaMetadataBulk.mockImplementation(async (ids: number[]) => ({
      data: {
        items: ids.map((id) => ({
          id,
          width: 1920,
          height: 1080,
          duration: id === 4 ? 30 : 0,
          filesize: 10,
        })),
      },
    }))
  })

  it('detects missing dimensions for images and videos', () => {
    expect(needsQuietMetaBackfill({width: 0, height: 0})).toBe(true)
    expect(needsQuietMetaBackfill({width: 10, height: 0})).toBe(true)
    expect(needsQuietMetaBackfill({width: 10, height: 10})).toBe(false)
    expect(needsQuietMetaBackfill({width: 0, height: 0, filesize: 0})).toBe(false)
  })

  it('batches quiet metadata requests into one bulk call', async () => {
    vi.useFakeTimers()
    const a = enqueueQuietMetaBackfill(1)
    const b = enqueueQuietMetaBackfill(2)
    const c = enqueueQuietMetaBackfill(1)
    enqueueQuietMetaBackfillMany([2, 3])

    await vi.advanceTimersByTimeAsync(50)
    const results = await Promise.all([a, b, c])

    expect(ensureMediaMetadataBulk).toHaveBeenCalledTimes(1)
    expect(ensureMediaMetadataBulk.mock.calls[0][0].sort()).toEqual([1, 2, 3])
    expect(results).toEqual([true, true, true])
    expect(syncMediaFileInfo).toHaveBeenCalled()

    await enqueueQuietMetaBackfill(1)
    expect(ensureMediaMetadataBulk).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('allows explicit image thumb+meta regen after meta settle', async () => {
    vi.useFakeTimers()
    const meta = enqueueQuietMetaBackfill(3)
    await vi.advanceTimersByTimeAsync(50)
    await meta
    vi.useRealTimers()

    expect(ensureMediaMetadataBulk).toHaveBeenCalledTimes(1)

    await enqueueImageThumbAndMeta(3)
    expect(refreshMediaFileInfo).toHaveBeenCalledTimes(1)
    expect(refreshThumb).toHaveBeenCalled()
  })

  it('does not refreshThumb or retry after empty/corrupt source', async () => {
    refreshMediaFileInfo.mockResolvedValueOnce({filesize: 0, width: 0, height: 0})
    const first = await enqueueImageThumbAndMeta(9)
    const second = await enqueueImageThumbAndMeta(9)
    expect(first).toBe(false)
    expect(second).toBe(false)
    expect(refreshMediaFileInfo).toHaveBeenCalledTimes(1)
    expect(refreshThumb).not.toHaveBeenCalled()
  })
})
