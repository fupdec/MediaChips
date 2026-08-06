/**
 * @vitest-environment node
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {stat, computeFingerprint, listMediaFilesFromRoots, queryAll} = vi.hoisted(() => ({
  stat: vi.fn(),
  computeFingerprint: vi.fn(),
  listMediaFilesFromRoots: vi.fn(async () => []),
  queryAll: vi.fn(() => []),
}))

vi.mock('fs/promises', () => ({stat}))
vi.mock('./mediaFingerprint', () => ({computeFingerprint}))
vi.mock('./mediaFileWalk', () => ({listMediaFilesFromRoots}))
vi.mock('../db/utils/rawQuery', () => ({queryAll}))
vi.mock('../db/repositories/mediaTypes', () => ({
  createMediaTypesRepository: () => ({
    findById: () => ({id: 1, type: 'video', extensions: 'mp4'}),
  }),
}))

import {
  SCAN_FOLDER_FINGERPRINT_CONCURRENCY,
  SCAN_FOLDER_STAT_CONCURRENCY,
  iterateScanFolderDuplicates,
} from './scanFolderDuplicates'

describe('iterateScanFolderDuplicates concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('caps parallel stat calls', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const paths = Array.from({length: 10}, (_, index) => `/tmp/a${index}.mp4`)

    stat.mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return {size: 100}
    })

    const events = []
    for await (const event of iterateScanFolderDuplicates({drizzle: {}} as never, {
      paths,
      mediaTypeId: 1,
      statConcurrency: 3,
      fingerprintConcurrency: 1,
    })) {
      events.push(event)
    }

    expect(maxInFlight).toBeLessThanOrEqual(3)
    expect(maxInFlight).toBeGreaterThan(1)
    expect(SCAN_FOLDER_STAT_CONCURRENCY).toBeGreaterThan(1)
    expect(events.some((event) => event.type === 'complete')).toBe(true)
  })

  it('caps parallel fingerprint calls for size-group candidates', async () => {
    const paths = Array.from({length: 8}, (_, index) => `/tmp/b${index}.mp4`)
    stat.mockResolvedValue({size: 1000})

    let inFlight = 0
    let maxInFlight = 0
    computeFingerprint.mockImplementation(async ({path: filePath}: {path: string}) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return {kind: 'oshash', value: `hash-${filePath}`}
    })

    for await (const _ of iterateScanFolderDuplicates({drizzle: {}} as never, {
      paths,
      mediaTypeId: 1,
      statConcurrency: 8,
      fingerprintConcurrency: 2,
    })) {
      // drain
    }

    // With identical sizes every file is a candidate.
    expect(computeFingerprint).toHaveBeenCalled()
    expect(maxInFlight).toBeLessThanOrEqual(2)
    expect(SCAN_FOLDER_FINGERPRINT_CONCURRENCY).toBeGreaterThan(1)
  })
})
