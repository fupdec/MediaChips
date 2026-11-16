import {createPinia, setActivePinia} from 'pinia'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {usePlayerStore} from '@/stores/player'
import {createPlayerLiveSession, type PlayerPlaybackSharedState} from './usePlayerLiveSession'
import {playLiveStreamWhenReady} from '@/services/transcodeService'
import type {MediaItem} from '@/types/stores'

const mocks = vi.hoisted(() => ({settings: {transcodeUnsupportedFormats: '1', transcodeMaxHeight: '1080'}}))
vi.mock('vue-i18n', () => ({useI18n: () => ({t: (value: string) => value})}))
vi.mock('@/stores/settings', () => ({useSettingsStore: () => mocks.settings}))
vi.mock('@/services/apiClient', () => ({buildApiUrl: (value: string) => value}))
vi.mock('@/services/transcodeService', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/transcodeService')>(),
  playLiveStreamWhenReady: vi.fn(async () => {}), stopLiveTranscode: vi.fn(async () => {}),
}))

describe('direct playback fallback', () => {
  let player: ReturnType<typeof usePlayerStore>
  let state: PlayerPlaybackSharedState
  let session: ReturnType<typeof createPlayerLiveSession>
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mocks.settings.transcodeUnsupportedFormats = '1'
    player = usePlayerStore()
    player.active = true
    player.paused = false
    player.media = {id: 17, path: '/tmp/movie.mp4'} as MediaItem
    player.player = document.createElement('video')
    player.player.src = '/original'
    vi.mocked(playLiveStreamWhenReady).mockImplementation(async () => { player.player!.currentTime = 0 })
    state = {forceDirectPlayback: false, liveStreamSeekGeneration: 0, currentLiveMediaId: null,
      directPlaybackFallbackAttempted: false, directPlaybackFallbackInFlight: false,
      liveStreamCopyCompatible: false, liveStreamAccurateSeek: false, transcodeSessionId: 0,
      isAdvancingChunk: false, pendingNextChunkStart: null, directSeekStallTimer: null}
    session = createPlayerLiveSession(state)
  })
  afterEach(() => { session.clearDirectSeekStallWatch(); vi.useRealTimers() })

  it('never converts an ordinary file merely because it is buffering', async () => {
    session.armDirectSeekStallWatch()
    await vi.advanceTimersByTimeAsync(20000)
    expect(playLiveStreamWhenReady).not.toHaveBeenCalled()
    expect(player.usesLiveTranscode).toBe(false)
  })
  it('gives a suspect container time to start and keeps original playback if it progresses', async () => {
    state.directPlaybackFallbackCandidate = true
    session.armDirectSeekStallWatch()
    await vi.advanceTimersByTimeAsync(11000)
    expect(playLiveStreamWhenReady).not.toHaveBeenCalled()
    player.player!.currentTime = 1
    await vi.advanceTimersByTimeAsync(1000)
    expect(playLiveStreamWhenReady).not.toHaveBeenCalled()
  })
  it('falls back once after a suspect decoder stalls without making progress', async () => {
    state.directPlaybackFallbackCandidate = true
    session.armDirectSeekStallWatch()
    await vi.advanceTimersByTimeAsync(12000)
    expect(playLiveStreamWhenReady).toHaveBeenCalledOnce()
    expect(player.usesLiveTranscode).toBe(true)
    expect(await session.tryFallbackDirectToLiveTranscode(3)).toBe(false)
  })
  it('recovers from an actual decode error at the current timeline position', async () => {
    player.player!.currentTime = 42
    expect(await session.tryFallbackDirectToLiveTranscode(3)).toBe(true)
    expect(player.liveStreamOffset).toBe(42)
    expect(player.currentTime).toBe(42)
    expect(player.player!.src).toContain('start=42')
  })
  it('respects disabled transcoding for both errors and stalled containers', async () => {
    mocks.settings.transcodeUnsupportedFormats = '0'
    state.directPlaybackFallbackCandidate = true
    session.armDirectSeekStallWatch()
    await vi.advanceTimersByTimeAsync(20000)
    expect(await session.tryFallbackDirectToLiveTranscode(4)).toBe(false)
    expect(playLiveStreamWhenReady).not.toHaveBeenCalled()
  })
  it('does not start playback when an unsupported source was opened paused', async () => {
    player.paused = true
    player.player!.currentTime = 42
    expect(await session.tryFallbackDirectToLiveTranscode(4)).toBe(true)
    expect(playLiveStreamWhenReady).not.toHaveBeenCalled()
    expect(player.paused).toBe(true)
    expect(player.currentTime).toBe(42)
  })
})
