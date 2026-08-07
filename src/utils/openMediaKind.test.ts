import {describe, expect, it} from 'vitest'
import {
  MEDIA_TYPE_AUDIO,
  MEDIA_TYPE_IMAGE,
  MEDIA_TYPE_TEXT,
  MEDIA_TYPE_VIDEO,
} from '@/types/media'
import {resolveOpenMediaKind} from './openMediaKind'

describe('resolveOpenMediaKind', () => {
  it('routes image / av / fallback', () => {
    expect(resolveOpenMediaKind({type: MEDIA_TYPE_IMAGE} as never)).toBe('view-image')
    expect(resolveOpenMediaKind({type: MEDIA_TYPE_VIDEO} as never)).toBe('play-av')
    expect(resolveOpenMediaKind({type: MEDIA_TYPE_AUDIO} as never)).toBe('play-av')
    expect(resolveOpenMediaKind(null)).toBe('browse-list')
    expect(resolveOpenMediaKind(null, {missingAsPlay: true})).toBe('play-av')
  })

  it('routes text to preview or external open by extension', () => {
    expect(resolveOpenMediaKind(
      {type: MEDIA_TYPE_TEXT} as never,
      {path: '/docs/note.txt'},
    )).toBe('preview-text')
    expect(resolveOpenMediaKind(
      {type: MEDIA_TYPE_TEXT} as never,
      {path: '/docs/page.html'},
    )).toBe('preview-text')
    expect(resolveOpenMediaKind(
      {type: MEDIA_TYPE_TEXT} as never,
      {path: '/docs/book.pdf'},
    )).toBe('open-path')
    expect(resolveOpenMediaKind({type: MEDIA_TYPE_TEXT} as never)).toBe('open-path')
  })
})
