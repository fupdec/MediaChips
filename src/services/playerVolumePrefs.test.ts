import {beforeEach, describe, expect, it} from 'vitest'
import {
  loadPlayerVolumePrefs,
  persistPlayerMuted,
  persistPlayerVolume,
} from './playerVolumePrefs'

describe('playerVolumePrefs', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to full volume unmuted', () => {
    expect(loadPlayerVolumePrefs()).toEqual({volume: 1, muted: false})
  })

  it('persists and restores volume and mute', () => {
    persistPlayerVolume(0.42)
    persistPlayerMuted(true)
    expect(loadPlayerVolumePrefs()).toEqual({volume: 0.42, muted: true})
  })

  it('clamps out-of-range volume', () => {
    persistPlayerVolume(2)
    expect(loadPlayerVolumePrefs().volume).toBe(1)
    persistPlayerVolume(-0.5)
    expect(loadPlayerVolumePrefs().volume).toBe(0)
  })
})
