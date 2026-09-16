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

  it('rewrites CloudDrive alias to drive mount', () => {
    expect(normalizeApiPath('/api/CloudDrive/status')).toBe('/api/drive/status')
    expect(normalizeApiPath('/api/clouddrive/folders/root')).toBe('/api/drive/folders/root')
    expect(normalizeApiPath('/api/drive/status')).toBe('/api/drive/status')
  })
})
