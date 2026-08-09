import {describe, expect, it} from 'vitest'
import {
  VIDEO_GRID_JPEG_QUALITY,
  VIDEO_GRID_REFERENCE_ASPECT_RATIO,
  VIDEO_GRID_SPRITE,
  VIDEO_MARK_HEIGHT,
  VIDEO_MARK_JPEG_QUALITY,
  VIDEO_THUMB_HEIGHT,
  VIDEO_THUMB_JPEG_QUALITY,
  buildGridCombineInputs,
  buildVideoGridTaskParams,
  getGridSpriteDimensions,
  getGridTileDimensions,
  getVideoGridSpriteWidth,
  makeXstackLayout,
  planGridTileTimestamps,
  gridTileSeekSeconds,
} from './videoPreview'

describe('videoPreview', () => {
  it('defines thumb and grid generation defaults', () => {
    expect(VIDEO_THUMB_HEIGHT).toBe(320)
    expect(VIDEO_THUMB_JPEG_QUALITY).toBe(4)
    expect(VIDEO_MARK_HEIGHT).toBe(180)
    expect(VIDEO_MARK_JPEG_QUALITY).toBe(4)
    expect(VIDEO_GRID_JPEG_QUALITY).toBe(4)
    expect(VIDEO_GRID_SPRITE).toEqual({
      cols: 3,
      rows: 3,
      tileWidth: 480,
    })
    expect(getVideoGridSpriteWidth(VIDEO_GRID_REFERENCE_ASPECT_RATIO)).toBe(1440)
  })

  it('keeps 16:9 tiles at the reference size', () => {
    expect(getGridTileDimensions(16 / 9)).toEqual({
      tileWidth: 480,
      tileHeight: 270,
    })
    expect(getGridSpriteDimensions(16 / 9)).toEqual({
      tileWidth: 480,
      tileHeight: 270,
      width: 1440,
      height: 810,
    })
  })

  it('limits portrait tiles by reference height instead of width', () => {
    expect(getGridTileDimensions(9 / 16)).toEqual({
      tileWidth: 152,
      tileHeight: 270,
    })
    expect(getGridSpriteDimensions(9 / 16)).toEqual({
      tileWidth: 152,
      tileHeight: 270,
      width: 456,
      height: 810,
    })
  })

  it('builds grid task params', () => {
    expect(buildVideoGridTaskParams('/in.mp4', '1.jpg')).toEqual({
      input: '/in.mp4',
      output: '1.jpg',
      width: 480,
      cols: 3,
      rows: 3,
    })
  })

  it('plans xstack layouts and mid-slice timestamps', () => {
    expect(makeXstackLayout(0, 3)).toBe('0_0')
    expect(makeXstackLayout(4, 3)).toBe('w0_h0')
    expect(makeXstackLayout(8, 3)).toBe('w0+w0_h0+h0')

    const {durSlice, timestamps} = planGridTileTimestamps(90, 9)
    expect(durSlice).toBe(10)
    expect(timestamps).toHaveLength(9)
    expect(timestamps[0]).toBe('00:00:05')
    expect(timestamps[8]).toBe('00:01:25')

    expect(gridTileSeekSeconds(90, 0, 9)).toBe(5)
    expect(gridTileSeekSeconds(90, 8, 9)).toBe(85)
    expect(gridTileSeekSeconds(900, 4)).toBe(450)
    expect(gridTileSeekSeconds(0, 0)).toBeNull()
    expect(gridTileSeekSeconds(100, 9)).toBeNull()
    // Clamp path: raw mid-slice stays in-range for matching duration.
    expect(gridTileSeekSeconds(10, 8, 9)).toBe(8.5)

    const combine = buildGridCombineInputs('/tmp/g', 2, 3, (dir, name) => `${dir}/${name}`)
    expect(combine).toEqual({
      inputFiles: ['/tmp/g/thumb0.png', '/tmp/g/thumb1.png'],
      streams: ['[0:v]', '[1:v]'],
      layouts: ['0_0', 'w0_0'],
    })
  })
})
