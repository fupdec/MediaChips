import {describe, expect, it} from 'vitest'
import {normalizeApiPath} from './normalizeApiPath'

describe('normalizeApiPath', () => {
  it('rewrites legacy lowercase resource segments to Express mounts', () => {
    expect(normalizeApiPath('/api/media/items')).toBe('/api/Media/items')
    expect(normalizeApiPath('/api/tag?x=1')).toBe('/api/Tag?x=1')
    expect(normalizeApiPath('/api/mediaType')).toBe('/api/MediaType')
    expect(normalizeApiPath('/api/mediaInPlaylists/3')).toBe('/api/MediaInPlaylists/3')
    expect(normalizeApiPath('/api/videoMetadata/9')).toBe('/api/VideoMetadata/9')
    expect(normalizeApiPath('/api/plugin/list')).toBe('/api/Plugin/list')
  })

  it('is case-insensitive on the first segment', () => {
    expect(normalizeApiPath('/api/MEDIA/thumbs')).toBe('/api/Media/thumbs')
    expect(normalizeApiPath('/api/TaG/1')).toBe('/api/Tag/1')
  })

  it('leaves canonical mounts and non-aliased paths alone', () => {
    expect(normalizeApiPath('/api/Media/items')).toBe('/api/Media/items')
    expect(normalizeApiPath('/api/home/health')).toBe('/api/home/health')
    expect(normalizeApiPath('/api/bulk-meta/apply')).toBe('/api/bulk-meta/apply')
    expect(normalizeApiPath('/api/scraper/performers')).toBe('/api/scraper/performers')
    expect(normalizeApiPath('/api/auth/login')).toBe('/api/auth/login')
    expect(normalizeApiPath('/not-api')).toBe('/not-api')
    expect(normalizeApiPath('')).toBe('')
  })
})
