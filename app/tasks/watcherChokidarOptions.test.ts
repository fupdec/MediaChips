import { describe, expect, it } from 'vitest'
import {
  buildChokidarOptions,
  isMountedVolumePath,
  needsPollingForFolders,
} from './watcherChokidarOptions'

describe('watcherChokidarOptions', () => {
  it('detects macOS mounted volume paths', () => {
    expect(isMountedVolumePath('/Volumes/pron/#torrents/')).toBe(true)
    expect(isMountedVolumePath('/Users/media/downloads')).toBe(false)
  })

  it('enables polling for mounted volumes on darwin', () => {
    const originalPlatform = process.platform

    try {
      Object.defineProperty(process, 'platform', {value: 'darwin'})

      expect(needsPollingForFolders(['/Volumes/pron/#torrents/'])).toBe(true)
      expect(needsPollingForFolders(['/Users/media/downloads'])).toBe(false)

      const options = buildChokidarOptions(['/Volumes/pron/#torrents/'])
      expect(options.usePolling).toBe(true)
      const awaitWriteFinish = options.awaitWriteFinish
      expect(
        awaitWriteFinish && typeof awaitWriteFinish === 'object'
          ? awaitWriteFinish.stabilityThreshold
          : undefined,
      ).toBe(1500)
    } finally {
      Object.defineProperty(process, 'platform', {value: originalPlatform})
    }
  })

  it('uses faster defaults for local folders', () => {
    const options = buildChokidarOptions(['/Users/media/downloads'])
    expect(options.usePolling).toBeUndefined()
    const awaitWriteFinish = options.awaitWriteFinish
    expect(
      awaitWriteFinish && typeof awaitWriteFinish === 'object'
        ? awaitWriteFinish.stabilityThreshold
        : undefined,
    ).toBe(1000)
  })

  it('ignores excluded paths via ignored callback', () => {
    const options = buildChokidarOptions(
      ['/Users/media/downloads'],
      ['/Users/media/downloads/tmp'],
    )
    expect(typeof options.ignored).toBe('function')
    const ignored = options.ignored as (path: string) => boolean
    expect(ignored('/Users/media/downloads/tmp/a.mp4')).toBe(true)
    expect(ignored('/Users/media/downloads/keep/a.mp4')).toBe(false)
    expect(ignored('/Users/media/downloads/.hidden')).toBe(true)
  })
})
