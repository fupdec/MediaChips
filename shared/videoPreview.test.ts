import {describe, expect, it} from 'vitest'
import {
  VIDEO_GRID_JPEG_QUALITY,
  VIDEO_GRID_REFERENCE_ASPECT_RATIO,
  VIDEO_GRID_SPRITE,
  VIDEO_MARK_HEIGHT,
  VIDEO_MARK_JPEG_QUALITY,
  VIDEO_THUMB_HEIGHT,
  VIDEO_THUMB_JPEG_QUALITY,
  buildVideoGridTaskParams,
  getGridSpriteDimensions,
  getGridTileDimensions,
  getVideoGridSpriteWidth,
} from './videoPreview'

describe('videoPreview', () => {
  it('defines thumb and grid generation defaults', () => {
    expect(VIDEO_THUMB_HEIGHT).toBe(320)
    expect(VIDEO_THUMB_JPEG_QUALITY).toBe(4)
    expect(VIDEO_MARK_HEIGHT).toBe(180)
    expect(VIDEO_MARK_JPEG_QUALITY).toBe(4)
    expect(VIDEO_GRID_JPEG_QUALITY).toBe(6)
    expect(VIDEO_GRID_SPRITE).toEqual({
      cols: 3,
      rows: 3,
      tileWidth: 360,
    })
    expect(getVideoGridSpriteWidth(VIDEO_GRID_REFERENCE_ASPECT_RATIO)).toBe(1080)
  })

  it('keeps 16:9 tiles at the reference size', () => {
    expect(getGridTileDimensions(16 / 9)).toEqual({
      tileWidth: 360,
      tileHeight: 203,
    })
    expect(getGridSpriteDimensions(16 / 9)).toEqual({
      tileWidth: 360,
      tileHeight: 203,
      width: 1080,
      height: 609,
    })
  })

  it('limits portrait tiles by reference height instead of width', () => {
    expect(getGridTileDimensions(9 / 16)).toEqual({
      tileWidth: 114,
      tileHeight: 203,
    })
    expect(getGridSpriteDimensions(9 / 16)).toEqual({
      tileWidth: 114,
      tileHeight: 203,
      width: 342,
      height: 609,
    })
  })

  it('builds grid task params', () => {
    expect(buildVideoGridTaskParams('/in.mp4', '1.jpg')).toEqual({
      input: '/in.mp4',
      output: '1.jpg',
      width: 360,
      cols: 3,
      rows: 3,
    })
  })
})
