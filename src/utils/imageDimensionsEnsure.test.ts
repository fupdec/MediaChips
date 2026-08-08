import { beforeEach, describe, expect, it, vi } from 'vitest'

const ensureImageDimensions = vi.hoisted(() => vi.fn())
const syncMediaFileInfo = vi.hoisted(() => vi.fn())

vi.mock('@/services/typedApi', () => ({
  typedApi: {ensureImageDimensions},
}))

vi.mock('@/services/mediaFileInfoService', () => ({
  syncMediaFileInfo,
}))

import {
  enqueueEnsureImageDimensions,
  resetImageDimensionsEnsureForTests,
} from './imageDimensionsEnsure'

describe('enqueueEnsureImageDimensions', () => {
  beforeEach(() => {
    resetImageDimensionsEnsureForTests()
    ensureImageDimensions.mockReset()
    syncMediaFileInfo.mockReset()
  })

  it('coalesces concurrent requests for the same media id', async () => {
    let resolveApi: (value: {data: {width: number; height: number}}) => void = () => undefined
    ensureImageDimensions.mockImplementation(
      () => new Promise((resolve) => {
        resolveApi = resolve
      }),
    )

    const a = enqueueEnsureImageDimensions(42)
    const b = enqueueEnsureImageDimensions(42)
    expect(ensureImageDimensions).toHaveBeenCalledTimes(1)

    resolveApi({data: {width: 1920, height: 1080}})
    await expect(a).resolves.toEqual({width: 1920, height: 1080})
    await expect(b).resolves.toEqual({width: 1920, height: 1080})
    expect(syncMediaFileInfo).toHaveBeenCalledWith(42, {
      width: 1920,
      height: 1080,
    })
  })

  it('does not re-probe settled ids', async () => {
    ensureImageDimensions.mockResolvedValue({data: {width: 0, height: 0}})
    await expect(enqueueEnsureImageDimensions(7)).resolves.toBeNull()
    await expect(enqueueEnsureImageDimensions(7)).resolves.toBeNull()
    expect(ensureImageDimensions).toHaveBeenCalledTimes(1)
  })

  it('limits concurrency across different ids', async () => {
    const resolvers: Array<(value: {data: {width: number; height: number}}) => void> = []
    ensureImageDimensions.mockImplementation(
      () => new Promise((resolve) => {
        resolvers.push(resolve)
      }),
    )

    const p1 = enqueueEnsureImageDimensions(1)
    const p2 = enqueueEnsureImageDimensions(2)
    const p3 = enqueueEnsureImageDimensions(3)
    expect(ensureImageDimensions).toHaveBeenCalledTimes(2)

    resolvers[0]!({data: {width: 10, height: 10}})
    await p1
    // pump() schedules the next task after the finally microtask.
    await vi.waitFor(() => {
      expect(ensureImageDimensions).toHaveBeenCalledTimes(3)
    })

    resolvers[1]!({data: {width: 20, height: 20}})
    resolvers[2]!({data: {width: 30, height: 30}})
    await Promise.all([p2, p3])
  })
})
