/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {clampWindowBounds} from './windowBounds'

describe('clampWindowBounds', () => {
  const primary = {x: 0, y: 0, width: 1920, height: 1080}

  it('keeps bounds that intersect a display', () => {
    expect(clampWindowBounds(
      {x: 100, y: 80, width: 1280, height: 720},
      {
        getDisplays: () => [{workArea: primary}],
        getPrimaryWorkArea: () => primary,
      },
    )).toEqual({x: 100, y: 80, width: 1280, height: 720})
  })

  it('recenters when bounds are off-screen or non-finite', () => {
    expect(clampWindowBounds(
      {x: Number.NaN, y: Number.NaN, width: 800, height: 600},
      {
        getDisplays: () => [{workArea: primary}],
        getPrimaryWorkArea: () => primary,
      },
    )).toEqual({
      x: Math.round((1920 - 800) / 2),
      y: Math.round((1080 - 600) / 2),
      width: 800,
      height: 600,
    })
  })

  it('enforces minimum width/height', () => {
    const result = clampWindowBounds(
      {x: 10, y: 10, width: 50, height: 20},
      {
        getDisplays: () => [{workArea: primary}],
        getPrimaryWorkArea: () => primary,
      },
    )
    expect(result.width).toBe(400)
    expect(result.height).toBe(300)
  })
})
