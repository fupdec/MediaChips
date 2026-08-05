import {describe, expect, it} from 'vitest'
import {isMediaPageItem, isTagPageItem, mediaPageItemPath} from './pageItem'

describe('pageItem guards', () => {
  const media = {id: 1, path: '/a.mp4'} as never
  const tag = {id: 2, name: 'A'} as never

  it('narrows by page type', () => {
    expect(isMediaPageItem(media, 'media')).toBe(true)
    expect(isMediaPageItem(tag, 'tag')).toBe(false)
    expect(isTagPageItem(tag, 'tag')).toBe(true)
    expect(isTagPageItem(media, 'media')).toBe(false)
  })

  it('returns path only for media pages', () => {
    expect(mediaPageItemPath(media, 'media')).toBe('/a.mp4')
    expect(mediaPageItemPath(tag, 'tag')).toBe('')
  })
})
