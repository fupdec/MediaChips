/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  EMBED_SIZE,
  buildEmbedFloatData,
  shouldAlignForEmbed,
} from './faceEmbedPrep'

describe('shouldAlignForEmbed', () => {
  it('requires a box with positive width/height', () => {
    expect(shouldAlignForEmbed(null)).toBe(false)
    expect(shouldAlignForEmbed({x: 0, y: 0, width: 1, height: 40} as never)).toBe(false)
    expect(shouldAlignForEmbed({x: 0, y: 0, width: 40, height: 40} as never)).toBe(true)
  })
})

describe('buildEmbedFloatData', () => {
  it('packs RGB into NCHW with InsightFace mean/std', () => {
    const rgb = [127.5, 255, 0]
    const data = buildEmbedFloatData(rgb, 1, 1)
    expect(data).toHaveLength(3)
    expect(data[0]).toBeCloseTo(0)
    expect(data[1]).toBeCloseTo(1)
    expect(data[2]).toBeCloseTo(-1)
    expect(EMBED_SIZE).toBe(112)
  })
})
