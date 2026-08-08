import {describe, expect, it} from 'vitest'
import {
  CARD_META_PLATE_GAP,
  HOVER_CARD_GAP,
  HOVER_CARD_MARGIN,
  HOVER_CARD_WIDTH,
  clampCardAnchoredPosition,
  clampHoverPosition,
  resolveCardMetaPlateWidth,
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

describe('clampCardAnchoredPosition', () => {
  const cardRect = {
    top: 120,
    left: 200,
    width: 256,
    height: 220,
    right: 456,
    bottom: 340,
  }

  it('places the plate to the right of the card when space allows', () => {
    const result = clampCardAnchoredPosition({
      cardRect,
      width: 360,
      height: 200,
      viewportWidth: 1400,
      viewportHeight: 900,
    })

    expect(result.x).toBe(cardRect.right + CARD_META_PLATE_GAP)
    expect(result.y).toBe(cardRect.top)
  })

  it('flips left when the right side is too tight', () => {
    const nearRight = {
      ...cardRect,
      left: 1000,
      right: 1256,
    }
    const result = clampCardAnchoredPosition({
      cardRect: nearRight,
      width: 360,
      height: 200,
      viewportWidth: 1300,
      viewportHeight: 900,
    })

    expect(result.x + result.width).toBeLessThanOrEqual(nearRight.left)
    expect(result.x).toBeGreaterThanOrEqual(HOVER_CARD_MARGIN)
  })

  it('keeps the plate inside the viewport', () => {
    const result = clampCardAnchoredPosition({
      cardRect: {top: 700, left: 50, width: 200, height: 180, right: 250, bottom: 880},
      width: 360,
      height: 400,
      viewportWidth: 900,
      viewportHeight: 800,
    })

    expect(result.x).toBeGreaterThanOrEqual(HOVER_CARD_MARGIN)
    expect(result.y).toBeGreaterThanOrEqual(HOVER_CARD_MARGIN)
    expect(result.x + result.width).toBeLessThanOrEqual(900 - HOVER_CARD_MARGIN)
    expect(result.y + result.height).toBeLessThanOrEqual(800 - HOVER_CARD_MARGIN)
  })
})

describe('resolveCardMetaPlateWidth', () => {
  it('scales with card width within min/max bounds', () => {
    expect(resolveCardMetaPlateWidth(200)).toBe(HOVER_CARD_WIDTH)
    expect(resolveCardMetaPlateWidth(300)).toBe(Math.round(300 * 1.35))
    expect(resolveCardMetaPlateWidth(500)).toBe(420)
  })
})
