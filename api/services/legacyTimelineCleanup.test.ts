import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
  LEGACY_TIMELINES_CLEANED_SETTING,
  getLegacyTimelinesDir,
  isLegacyTimelineFile,
  isLegacyTimelineCleanupDone,
  markLegacyTimelineCleanupDone,
  removeLegacyTimelineFiles,
  runLegacyTimelineCleanup,
} from './legacyTimelineCleanup'

const tempDirs: string[] = []
const findByOption = vi.fn()
const upsertByOption = vi.fn()

vi.mock('../db/repositories/settings', () => ({
  createSettingsRepository: () => ({
    findByOption,
    upsertByOption,
  }),
}))

async function createTempDbRoot(): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mediachips-legacy-timeline-'))
  tempDirs.push(dir)
  return dir
}

function createDb(dbRoot: string) {
  return {
    path: dbRoot,
    drizzle: {},
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  findByOption.mockReturnValue(undefined)
  upsertByOption.mockImplementation(() => ({created: true}))
})

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(async (dir) => {
    await fs.promises.rm(dir, {recursive: true, force: true}).catch(() => {})
  }))
})

describe('legacyTimelineCleanup', () => {
  it('matches only legacy timeline frame files', () => {
    expect(isLegacyTimelineFile('42_5.jpg')).toBe(true)
    expect(isLegacyTimelineFile('42_95.jpg')).toBe(true)
    expect(isLegacyTimelineFile('42.jpg')).toBe(false)
    expect(isLegacyTimelineFile('42_grid.jpg')).toBe(false)
    expect(isLegacyTimelineFile('note.txt')).toBe(false)
  })

  it('removes legacy timeline files in batches', async () => {
    const dbRoot = await createTempDbRoot()
    const timelinesDir = getLegacyTimelinesDir(dbRoot)
    await fs.promises.mkdir(timelinesDir, {recursive: true})
    await fs.promises.writeFile(path.join(timelinesDir, '1_5.jpg'), 'a')
    await fs.promises.writeFile(path.join(timelinesDir, '1_95.jpg'), 'b')
    await fs.promises.writeFile(path.join(timelinesDir, '2.jpg'), 'c')

    const result = await removeLegacyTimelineFiles(timelinesDir, {batchSize: 1})

    expect(result).toEqual({removed: 2, failed: 0})
    expect(fs.existsSync(path.join(timelinesDir, '1_5.jpg'))).toBe(false)
    expect(fs.existsSync(path.join(timelinesDir, '1_95.jpg'))).toBe(false)
    expect(fs.existsSync(path.join(timelinesDir, '2.jpg'))).toBe(true)
  })

  it('marks cleanup done when no legacy files remain', async () => {
    const dbRoot = await createTempDbRoot()
    const db = createDb(dbRoot)
    const timelinesDir = getLegacyTimelinesDir(dbRoot)
    await fs.promises.mkdir(timelinesDir, {recursive: true})
    await fs.promises.writeFile(path.join(timelinesDir, '10_15.jpg'), 'frame')

    const first = await runLegacyTimelineCleanup(db)
    expect(first).toEqual({skipped: false, removed: 1, failed: 0})
    expect(fs.existsSync(timelinesDir)).toBe(false)
    expect(upsertByOption).toHaveBeenCalledWith(LEGACY_TIMELINES_CLEANED_SETTING, '1')

    findByOption.mockReturnValue({value: '1'})
    const second = await runLegacyTimelineCleanup(db)
    expect(second).toEqual({skipped: true, removed: 0, failed: 0})
  })

  it('skips immediately when cleanup marker is already set', async () => {
    const dbRoot = await createTempDbRoot()
    const db = createDb(dbRoot)
    const timelinesDir = getLegacyTimelinesDir(dbRoot)
    await fs.promises.mkdir(timelinesDir, {recursive: true})
    await fs.promises.writeFile(path.join(timelinesDir, '11_25.jpg'), 'frame')

    findByOption.mockReturnValue({value: '1'})
    expect(isLegacyTimelineCleanupDone(db)).toBe(true)

    const result = await runLegacyTimelineCleanup(db)
    expect(result).toEqual({skipped: true, removed: 0, failed: 0})
    expect(fs.existsSync(path.join(timelinesDir, '11_25.jpg'))).toBe(true)
  })

  it('stores cleanup marker in settings', () => {
    const db = createDb('/tmp/db')
    markLegacyTimelineCleanupDone(db)
    expect(upsertByOption).toHaveBeenCalledWith(LEGACY_TIMELINES_CLEANED_SETTING, '1')
  })
})
