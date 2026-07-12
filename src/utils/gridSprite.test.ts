import {describe, expect, it} from 'vitest'
import {
  GRID_FRAME_INDEXES,
  GRID_SPRITE,
  buildGridSpriteFrameStyle,
  getContainedFrameSizePercents,
  getGridFramePercent,
  gridFrameBackgroundPosition,
  pickGridFrameIndex,
} from './gridSprite'

describe('gridSprite', () => {
  it('exposes nine frame indexes in a 3x3 grid', () => {
    expect(GRID_SPRITE.tileCount).toBe(9)
    expect(GRID_FRAME_INDEXES).toHaveLength(9)
  })

  it('maps hover percent to the nearest grid frame', () => {
    expect(pickGridFrameIndex(0)).toBe(0)
    expect(pickGridFrameIndex(12)).toBe(1)
    expect(pickGridFrameIndex(50)).toBe(4)
    expect(pickGridFrameIndex(100)).toBe(8)
  })

  it('uses equal-duration frame percents', () => {
    expect(getGridFramePercent(0)).toBeCloseTo(5.555, 2)
    expect(getGridFramePercent(4)).toBe(50)
    expect(getGridFramePercent(8)).toBeCloseTo(94.444, 2)
  })

  it('builds background positions for each tile', () => {
    expect(gridFrameBackgroundPosition(0)).toBe('0% 0%')
    expect(gridFrameBackgroundPosition(1)).toBe('50% 0%')
    expect(gridFrameBackgroundPosition(4)).toBe('50% 50%')
    expect(gridFrameBackgroundPosition(8)).toBe('100% 100%')
  })

  it('builds css sprite frame styles', () => {
    expect(buildGridSpriteFrameStyle('/grid.jpg', 4, 16 / 9)).toEqual({
      width: '100%',
      height: '100%',
      flexShrink: '0',
      backgroundImage: 'url("/grid.jpg")',
      backgroundSize: '300% 300%',
      backgroundPosition: '50% 50%',
      backgroundRepeat: 'no-repeat',
    })
  })

  it('letterboxes portrait sprites inside a 16:9 preview block', () => {
    expect(getContainedFrameSizePercents(9 / 16)).toEqual({
      width: '31.640625%',
      height: '100%',
    })
  })

  it('letterboxes ultrawide sprites inside a 16:9 preview block', () => {
    expect(getContainedFrameSizePercents(21 / 9)).toEqual({
      width: '100%',
      height: '76.19047619047619%',
    })
  })
})
