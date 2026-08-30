import { describe, expect, it } from 'vitest'
import {
  getMediaThumbAspectRatio,
  getVideoThumbOutputPath,
  getVideoThumbSaveSizes,
  pickBestSceneImage,
} from './sceneScraperPoster'
import { VIDEO_THUMB_HEIGHT } from '@shared/videoPreview'

describe('sceneScraperPoster', () => {
  it('picks the largest scene image by pixel area', () => {
    const best = pickBestSceneImage([
      { url: 'https://example.com/small.jpg', width: 320, height: 180 },
      { url: 'https://example.com/large.jpg', width: 1280, height: 720 },
    ])

    expect(best?.url).toBe('https://example.com/large.jpg')
  })

  it('builds thumb sizes from media aspect ratio', () => {
    const sizes = getVideoThumbSaveSizes(getMediaThumbAspectRatio(1920, 1080))

    expect(sizes.height).toBe(VIDEO_THUMB_HEIGHT)
    expect(sizes.width).toBe(Math.round(VIDEO_THUMB_HEIGHT * (1920 / 1080)))
  })

  it('normalizes Windows mediaPath separators for thumb output', () => {
    expect(getVideoThumbOutputPath('C:\\Users\\x\\db\\media', 42)).toBe(
      'C:/Users/x/db/media/videos/thumbs/42.jpg',
    )
    expect(getVideoThumbOutputPath('C:/Users/x/db/media', 7, 'videos')).toBe(
      'C:/Users/x/db/media/videos/thumbs/7.jpg',
    )
  })
})
