import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  getVideoThumbPath,
  isVideoThumbRequest,
  parseVideoThumbMediaId,
} from './videoPreviewThumb'

describe('videoPreviewThumb', () => {
  it('parses media id from thumb paths', () => {
    expect(parseVideoThumbMediaId('/db/media/videos/thumbs/42.jpg')).toBe(42)
    expect(parseVideoThumbMediaId('C:\\db\\media\\videos\\thumbs\\7.jpg')).toBe(7)
    expect(parseVideoThumbMediaId('/db/media/videos/grids/42.jpg')).toBeNull()
    expect(parseVideoThumbMediaId('/db/media/images/thumbs/42.jpg')).toBeNull()
  })

  it('detects video thumb requests', () => {
    expect(isVideoThumbRequest('/db/media/videos/thumbs/1.jpg')).toBe(true)
    expect(isVideoThumbRequest('/db/media/videos/grids/1.jpg')).toBe(false)
  })

  it('builds thumb output path', () => {
    expect(getVideoThumbPath('/tmp/db', 15)).toBe(
      path.join('/tmp/db', 'media/videos/thumbs/15.jpg'),
    )
  })
})
