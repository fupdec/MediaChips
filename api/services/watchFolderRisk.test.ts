import {describe, expect, it} from 'vitest'
import {
  GRADE_GREEN_MAX,
  GRADE_YELLOW_MAX,
  PLATFORM_LIMIT_NATIVE,
  PLATFORM_LIMIT_POLLING,
  gradeWatchFolderRisk,
  resolveWatchLimit,
} from './watchFolderRisk'

describe('watchFolderRisk grading', () => {
  it('uses calibrated darwin native limit', () => {
    expect(PLATFORM_LIMIT_NATIVE.darwin).toBe(40_000)
    expect(PLATFORM_LIMIT_POLLING).toBe(5_000)
  })

  it('applies HDD factor and polling limit', () => {
    expect(resolveWatchLimit({platform: 'darwin', usePolling: false, diskKind: 'ssd'})).toBe(40_000)
    expect(resolveWatchLimit({platform: 'darwin', usePolling: false, diskKind: 'hdd'})).toBe(20_000)
    expect(resolveWatchLimit({platform: 'win32', usePolling: true, diskKind: 'unknown'})).toBe(5_000)
  })

  it('grades by ratio bands', () => {
    const limit = 40_000
    expect(gradeWatchFolderRisk(0, limit, 'win32').grade).toBe('green')
    expect(gradeWatchFolderRisk(Math.floor(limit * GRADE_GREEN_MAX) - 1, limit, 'win32').grade).toBe('green')
    expect(gradeWatchFolderRisk(Math.floor(limit * 0.5), limit, 'win32').grade).toBe('yellow')
    expect(gradeWatchFolderRisk(Math.floor(limit * GRADE_YELLOW_MAX), limit, 'win32').grade).toBe('red')
  })

  it('applies darwin yellow floor at 4096', () => {
    const limit = 40_000
    // Under floor and under green ratio → green
    expect(gradeWatchFolderRisk(1000, limit, 'darwin').grade).toBe('green')
    // At floor but still under green ratio → yellow
    expect(gradeWatchFolderRisk(4096, limit, 'darwin').grade).toBe('yellow')
    expect(gradeWatchFolderRisk(4096, limit, 'win32').grade).toBe('green')
  })
})
