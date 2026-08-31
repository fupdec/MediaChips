import {describe, expect, it} from 'vitest'
import {
  buildDefaultLibraryNavConfig,
  mediaTypeNavKey,
  mergeLibraryNavConfig,
  parseMediaTypeNavKey,
  serializeLibraryNavConfig,
} from './libraryNavConfig'

describe('libraryNavConfig', () => {
  const mediaTypes = [
    {id: 2, order: 1, hidden: false},
    {id: 1, order: 0, hidden: true},
  ]

  it('builds default order and hidden flags', () => {
    const config = buildDefaultLibraryNavConfig(mediaTypes, {
      showPlaylists: false,
      showMarkers: true,
    })

    expect(config.order).toEqual([
      'home',
      'media-1',
      'media-2',
      'folders',
      'playlists',
      'markers',
    ])
    expect(config.hidden['media-1']).toBe(true)
    expect(config.hidden['media-2']).toBe(false)
    expect(config.hidden.playlists).toBe(true)
    expect(config.hidden.markers).toBe(false)
  })

  it('merges saved order and appends new media types', () => {
    const config = mergeLibraryNavConfig(
      {
        order: ['folders', 'home', 'media-2', 'playlists'],
        hidden: {home: true, folders: false},
      },
      [...mediaTypes, {id: 3, order: 2, hidden: false}],
      {showPlaylists: true, showMarkers: true},
    )

    expect(config.order).toEqual([
      'folders',
      'home',
      'media-2',
      'playlists',
      'media-1',
      'media-3',
      'markers',
    ])
    expect(config.hidden.home).toBe(true)
    expect(config.hidden['media-1']).toBe(true)
    expect(config.hidden['media-3']).toBe(false)
  })

  it('drops removed media keys and round-trips serialize', () => {
    const merged = mergeLibraryNavConfig(
      {
        order: ['home', 'media-9', 'folders'],
        hidden: {'media-9': true},
      },
      [{id: 1, order: 0, hidden: false}],
    )

    expect(merged.order).toEqual(['home', 'folders', 'media-1', 'playlists', 'markers'])
    expect(merged.hidden['media-9']).toBeUndefined()

    const serialized = serializeLibraryNavConfig(merged)
    expect(JSON.parse(serialized).order).toEqual(merged.order)
  })

  it('parses media type keys', () => {
    expect(mediaTypeNavKey(4)).toBe('media-4')
    expect(parseMediaTypeNavKey('media-4')).toBe(4)
    expect(parseMediaTypeNavKey('folders')).toBeNull()
  })
})
