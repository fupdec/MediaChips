import {describe, it, expect} from 'vitest'
import {
  getRemainingPlaybackSeconds,
  isPlaylistNavDisabled,
  resolvePlaylistIndex,
  shouldDisableTimelineHoverPreview,
  shouldShowUpNextPreview,
  UP_NEXT_SECONDS,
} from '@/composable/usePlayerTransportPlayback'

const base = {
  playlistMode: [],
  playlistShuffle: [2, 0, 1],
  nowPlaying: 1,
  playlistLength: 3,
}

describe('isPlaylistNavDisabled', () => {
  it('disables prev at first item without loop', () => {
    expect(isPlaylistNavDisabled({
      ...base,
      nowPlaying: 0,
      direction: 'prev',
    })).toBe(true)
  })

  it('allows prev with loop mode', () => {
    expect(isPlaylistNavDisabled({
      ...base,
      playlistMode: ['loop'],
      nowPlaying: 0,
      direction: 'prev',
    })).toBe(false)
  })

  it('disables next at last shuffle item without loop', () => {
    expect(isPlaylistNavDisabled({
      ...base,
      playlistMode: ['shuffle'],
      playlistShuffle: [2, 0, 1],
      nowPlaying: 1,
      direction: 'next',
    })).toBe(true)
  })
})

describe('resolvePlaylistIndex', () => {
  it('moves to next sequential index', () => {
    expect(resolvePlaylistIndex({
      ...base,
      nowPlaying: 1,
      direction: 'next',
    })).toBe(2)
  })

  it('wraps to end with loop on prev from first item', () => {
    expect(resolvePlaylistIndex({
      ...base,
      playlistMode: ['loop'],
      nowPlaying: 0,
      direction: 'prev',
    })).toBe(2)
  })

  it('follows shuffle order on next', () => {
    expect(resolvePlaylistIndex({
      ...base,
      playlistMode: ['shuffle'],
      playlistShuffle: [2, 0, 1],
      nowPlaying: 0,
      direction: 'next',
    })).toBe(1)
  })
})

describe('up next preview timing', () => {
  it('computes remaining playback seconds', () => {
    expect(getRemainingPlaybackSeconds(95, 100)).toBe(5)
    expect(getRemainingPlaybackSeconds(120, 100)).toBe(0)
    expect(getRemainingPlaybackSeconds(10, 0)).toBe(Number.POSITIVE_INFINITY)
  })

  it('shows only in the final window when a next item exists', () => {
    expect(UP_NEXT_SECONDS).toBe(5)
    expect(shouldShowUpNextPreview({
      remainingSeconds: 5,
      hasNext: true,
    })).toBe(true)
    expect(shouldShowUpNextPreview({
      remainingSeconds: 5.01,
      hasNext: true,
    })).toBe(false)
    expect(shouldShowUpNextPreview({
      remainingSeconds: 3,
      hasNext: false,
    })).toBe(false)
    expect(shouldShowUpNextPreview({
      remainingSeconds: 0,
      hasNext: true,
    })).toBe(false)
  })

  it('disables timeline hover preview in the up-next window', () => {
    expect(shouldDisableTimelineHoverPreview(5)).toBe(true)
    expect(shouldDisableTimelineHoverPreview(4.2)).toBe(true)
    expect(shouldDisableTimelineHoverPreview(0)).toBe(true)
    expect(shouldDisableTimelineHoverPreview(5.01)).toBe(false)
  })
})
