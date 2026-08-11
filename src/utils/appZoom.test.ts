import {describe, expect, it} from 'vitest'
import {
  clampZoom,
  formatZoomPercent,
  getNextZoom,
  parseZoom,
  snapZoom,
  applyAppZoomStyles,
} from './appZoom'

describe('appZoom', () => {
  it('parses and clamps zoom', () => {
    expect(parseZoom('1.5')).toBe(1.5)
    expect(parseZoom('nope')).toBe(1)
    expect(clampZoom(0.1)).toBe(0.5)
    expect(clampZoom(9)).toBe(3)
  })

  it('snaps and formats percent', () => {
    expect(snapZoom(1.23)).toBe(1.25)
    expect(formatZoomPercent(1)).toBe('100%')
  })

  it('steps to next/previous zoom presets', () => {
    expect(getNextZoom(1, 1)).toBe(1.1)
    expect(getNextZoom(1, -1)).toBe(0.9)
    expect(getNextZoom(3, 1)).toBe(3)
    // Below MIN_ZOOM is clamped to 0.5 first, then stepped down to 0.33.
    expect(getNextZoom(0.5, -1)).toBe(0.33)
    expect(getNextZoom(0.25, -1)).toBe(0.33)
  })

  it('applies inverse width so CSS zoom does not clip horizontally', () => {
    const style = {zoom: '', width: '', height: ''}
    expect(applyAppZoomStyles(style, 1.25)).toBe(1.25)
    expect(style.zoom).toBe('1.25')
    expect(style.width).toBe('80%')
    // Height stays auto — inverse height collapses aspect-ratio thumbs.
    expect(style.height).toBe('')

    applyAppZoomStyles(style, 1)
    expect(style.zoom).toBe('')
    expect(style.width).toBe('')
    expect(style.height).toBe('')
  })
})
