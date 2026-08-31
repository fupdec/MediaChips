import {describe, expect, it} from 'vitest'
import {
  isMountedVolumePath,
  isUncPath,
  needsPollingForFolders,
  needsPollingForPath,
  stabilityThresholdMs,
} from '../../api/utils/watchPathHints'
import {collectExcludedWatchPaths} from './watcherOptions'

describe('watchPathHints / watcherOptions', () => {
  it('detects macOS mounted volume paths', () => {
    expect(isMountedVolumePath('/Volumes/pron/#torrents/')).toBe(true)
    expect(isMountedVolumePath('/Users/media/downloads')).toBe(false)
  })

  it('detects UNC paths', () => {
    expect(isUncPath('\\\\server\\share\\media')).toBe(true)
    expect(isUncPath('//server/share/media')).toBe(true)
    expect(isUncPath('/Users/media')).toBe(false)
  })

  it('enables polling for mounted volumes on darwin and UNC everywhere', () => {
    const originalPlatform = process.platform

    try {
      Object.defineProperty(process, 'platform', {value: 'darwin'})
      expect(needsPollingForFolders(['/Volumes/pron/#torrents/'])).toBe(true)
      expect(needsPollingForFolders(['/Users/media/downloads'])).toBe(false)
      expect(stabilityThresholdMs(true)).toBe(1500)
      expect(stabilityThresholdMs(false)).toBe(1000)
    } finally {
      Object.defineProperty(process, 'platform', {value: originalPlatform})
    }

    expect(needsPollingForPath('\\\\nas\\media')).toBe(true)
  })

  it('collects unique excluded paths', () => {
    expect(collectExcludedWatchPaths([
      {excludedPaths: ['/media/a', '/media/b']},
      {excludedPaths: ['/media/a', '/media/c']},
    ])).toEqual(['/media/a', '/media/b', '/media/c'])
  })
})
