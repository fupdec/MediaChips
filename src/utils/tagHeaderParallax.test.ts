import {describe, expect, it} from 'vitest'
import {
  TAG_HEADER_PARALLAX_OVERSCAN,
  TAG_HEADER_PARALLAX_RATE,
  tagHeaderParallaxOffset,
} from './tagHeaderParallax'

describe('tagHeaderParallaxOffset', () => {
  it('stays at rest without scroll or a measurable header', () => {
    expect(tagHeaderParallaxOffset(0, 400)).toBe(0)
    expect(tagHeaderParallaxOffset(-20, 400)).toBe(0)
    expect(tagHeaderParallaxOffset(100, 0)).toBe(0)
    expect(tagHeaderParallaxOffset(Number.NaN, 400)).toBe(0)
  })

  it('moves the image slower than the page scroll', () => {
    expect(tagHeaderParallaxOffset(80, 500)).toBeCloseTo(80 * TAG_HEADER_PARALLAX_RATE)
  })

  it('keeps moving until the entire header has scrolled out of view', () => {
    const headerHeight = 500

    for (const distance of [100, 250, 400, 500]) {
      expect(tagHeaderParallaxOffset(distance, headerHeight))
        .toBeCloseTo(distance * TAG_HEADER_PARALLAX_RATE)
    }
  })

  it('clamps to the overscan so the frame never shows empty space', () => {
    const headerHeight = 500
    const maxOffset = headerHeight * TAG_HEADER_PARALLAX_OVERSCAN

    expect(tagHeaderParallaxOffset(10_000, headerHeight)).toBeCloseTo(maxOffset)
    expect(maxOffset).toBeLessThan(headerHeight)
  })
})
