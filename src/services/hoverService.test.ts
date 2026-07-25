import {describe, expect, it} from 'vitest'
import {
  HOVER_CARD_GAP,
  HOVER_CARD_MARGIN,
  HOVER_CARD_WIDTH,
  clampHoverPosition,
} from '@/services/hoverService'

describe('clampHoverPosition', () => {
  it('places the card below-right of the cursor by default', () => {
    const result = clampHoverPosition({
      anchorX: 100,
      anchorY: 80,
      width: HOVER_CARD_WIDTH,
      height: 160,
      viewportWidth: 1200,
      viewportHeight: 800,
    })

    expect(result.x).toBe(100 + HOVER_CARD_GAP)
    expect(result.y).toBe(80 + HOVER_CARD_GAP)
    expect(result.width).toBe(HOVER_CARD_WIDTH)
    expect(result.height).toBe(160)
  })

  it('flips left when the card would overflow the right edge', () => {
    const result = clampHoverPosition({
      anchorX: 1100,
      anchorY: 100,
      width: HOVER_CARD_WIDTH,
      height: 160,
      viewportWidth: 1200,
      viewportHeight: 800,
    })

    expect(result.x).toBe(1100 - HOVER_CARD_WIDTH - HOVER_CARD_GAP)
    expect(result.x + result.width).toBeLessThanOrEqual(1200 - HOVER_CARD_MARGIN)
  })

  it('flips above when the card would overflow the bottom edge', () => {
    const result = clampHoverPosition({
      anchorX: 100,
      anchorY: 750,
      width: HOVER_CARD_WIDTH,
      height: 200,
      viewportWidth: 1200,
      viewportHeight: 800,
    })

    expect(result.y).toBe(750 - 200 - HOVER_CARD_GAP)
    expect(result.y + result.height).toBeLessThanOrEqual(800 - HOVER_CARD_MARGIN)
  })

  it('clamps into the viewport near corners', () => {
    const result = clampHoverPosition({
      anchorX: 1180,
      anchorY: 780,
      width: HOVER_CARD_WIDTH,
      height: 400,
      viewportWidth: 1200,
      viewportHeight: 800,
    })

    expect(result.x).toBeGreaterThanOrEqual(HOVER_CARD_MARGIN)
    expect(result.y).toBeGreaterThanOrEqual(HOVER_CARD_MARGIN)
    expect(result.x + result.width).toBeLessThanOrEqual(1200 - HOVER_CARD_MARGIN)
    expect(result.y + result.height).toBeLessThanOrEqual(800 - HOVER_CARD_MARGIN)
  })

  it('shrinks height to the available viewport and exposes maxHeight', () => {
    const result = clampHoverPosition({
      anchorX: 40,
      anchorY: 40,
      width: HOVER_CARD_WIDTH,
      height: 2000,
      viewportWidth: 1000,
      viewportHeight: 500,
    })

    expect(result.maxHeight).toBe(500 - HOVER_CARD_MARGIN * 2)
    expect(result.height).toBe(result.maxHeight)
    expect(result.y).toBe(HOVER_CARD_MARGIN)
  })
})
