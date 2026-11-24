import {describe, expect, it} from 'vitest'
import {audioTracksOf, subtitleTracksOf, trackLabel} from './mpvTracks'
import type {NativeTrack} from '@/services/nativePlayer'

const track = (overrides: Partial<NativeTrack>): NativeTrack => ({
  id: 1, type: 'audio', lang: '', title: '', codec: '', selected: false, default: false, forced: false, external: false,
  ...overrides,
})

describe('mpvTracks', () => {
  it('splits tracks by type and ignores video', () => {
    const all = [track({id: 1, type: 'video'}), track({id: 2}), track({id: 3, type: 'sub'}), track({id: 4})]
    expect(audioTracksOf(all).map(item => item.id)).toEqual([2, 4])
    expect(subtitleTracksOf(all).map(item => item.id)).toEqual([3])
  })

  it('labels with language, title and codec', () => {
    expect(trackLabel(track({lang: 'eng', title: 'Commentary', codec: 'ac3'}), id => `Track ${id}`)).toBe('eng · Commentary (ac3)')
    expect(trackLabel(track({lang: 'rus', codec: 'aac'}), id => `Track ${id}`)).toBe('rus (aac)')
  })

  it('falls back to the track number when nothing is known', () => {
    expect(trackLabel(track({id: 3}), id => `Track ${id}`)).toBe('Track 3')
  })
})
