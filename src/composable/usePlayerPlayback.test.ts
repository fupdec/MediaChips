import {describe, it, expect} from 'vitest'
import {
  resolvePlayableVideo,
  isLoadSrcSessionStale,
  getLiveChunkRelativeTime,
} from '@/composable/usePlayerPlayback'

/** Re-export surface stays stable for older imports. */
describe('usePlayerPlayback re-exports', () => {
  it('exposes pure playback helpers', () => {
    expect(typeof resolvePlayableVideo).toBe('function')
    expect(typeof isLoadSrcSessionStale).toBe('function')
    expect(getLiveChunkRelativeTime(670, 660)).toBe(10)
  })
})
