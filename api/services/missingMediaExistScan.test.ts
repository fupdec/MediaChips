/**
 * @vitest-environment node
 */
import {describe, expect, it, vi} from 'vitest'
import {
  MISSING_MEDIA_EXIST_CONCURRENCY,
  collectMissingMediaByPathExist,
} from './missingMediaExistScan'

describe('collectMissingMediaByPathExist', () => {
  it('returns missing rows in input order', async () => {
    const pathExists = vi.fn(async (filePath: string) => filePath !== '/missing.mp4')
    const missing = await collectMissingMediaByPathExist([
      {id: 1, path: '/a.mp4'},
      {id: 2, path: '/missing.mp4'},
      {id: 3, path: '/b.mp4'},
    ], {pathExists, concurrency: 2})

    expect(missing.map((row) => row.id)).toEqual([2])
    expect(pathExists).toHaveBeenCalledTimes(3)
  })

  it('caps in-flight existence checks', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const pathExists = vi.fn(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return true
    })

    const items = Array.from({length: 10}, (_, index) => ({
      id: index + 1,
      path: `/${index}.mp4`,
    }))

    await collectMissingMediaByPathExist(items, {
      pathExists,
      concurrency: 3,
    })

    expect(maxInFlight).toBeLessThanOrEqual(3)
    expect(maxInFlight).toBeGreaterThan(1)
  })

  it('stops scheduling new checks when shouldStop flips', async () => {
    let processed = 0
    const pathExists = vi.fn(async () => {
      processed += 1
      await new Promise((resolve) => setTimeout(resolve, 1))
      return true
    })

    await collectMissingMediaByPathExist(
      Array.from({length: 20}, (_, index) => ({path: `/${index}.mp4`})),
      {
        pathExists,
        concurrency: 2,
        shouldStop: () => processed >= 4,
      },
    )

    expect(processed).toBeLessThan(20)
  })

  it('uses the default concurrency constant', () => {
    expect(MISSING_MEDIA_EXIST_CONCURRENCY).toBeGreaterThan(1)
  })
})
