import {describe, expect, it} from 'vitest'
import {clampPan, clampZoom, pinchTransform, stepZoom, zoomPercent, zoomToSelection} from './playerZoom'

describe('playerZoom', () => {
  it('keeps zoom within 100-400%', () => {
    expect(clampZoom(0.5)).toBe(1)
    expect(clampZoom(9)).toBe(4)
    expect(clampZoom(Number.NaN)).toBe(1)
    expect(clampZoom(1.234)).toBe(1.23)
  })

  it('steps by a quarter and stops at the limits', () => {
    expect(stepZoom(1, 1)).toBe(1.25)
    expect(stepZoom(1, -1)).toBe(1)
    expect(stepZoom(4, 1)).toBe(4)
  })

  it('limits the pan to the overflow of the zoomed picture', () => {
    expect(clampPan({x: 500, y: -500}, 2, {width: 1000, height: 400})).toEqual({x: 500, y: -200})
    expect(clampPan({x: 900, y: 0}, 2, {width: 1000, height: 400})).toEqual({x: 500, y: 0})
  })

  it('has no pan without zoom', () => {
    expect(clampPan({x: 50, y: 50}, 1, {width: 1000, height: 400})).toEqual({x: 0, y: 0})
  })

  it('formats percent', () => {
    expect(zoomPercent(1.25)).toBe('125%')
  })
})

describe('pinchTransform', () => {
  const box = {width: 800, height: 400}
  const start = {zoom: 1, pan: {x: 0, y: 0}, distance: 100, mid: {x: 0, y: 0}}

  it('zooms by the finger distance ratio and clamps to the limits', () => {
    expect(pinchTransform(start, {distance: 200, mid: {x: 0, y: 0}}, box).zoom).toBe(2)
    expect(pinchTransform(start, {distance: 1000, mid: {x: 0, y: 0}}, box).zoom).toBe(4)
    expect(pinchTransform(start, {distance: 10, mid: {x: 0, y: 0}}, box).zoom).toBe(1)
  })

  it('keeps the point under the fingers in place', () => {
    // The fingers' midpoint is 100 px right of the centre: after zooming to 2x the picture shifts left by 100 px.
    const result = pinchTransform({...start, mid: {x: 100, y: 0}}, {distance: 200, mid: {x: 100, y: 0}}, box)
    expect(result.zoom).toBe(2)
    expect(result.pan).toEqual({x: -100, y: 0})
  })

  it('drags along with the fingers and never leaves the overflow', () => {
    const dragged = pinchTransform({...start, zoom: 2, pan: {x: 0, y: 0}}, {distance: 100, mid: {x: 50, y: 20}}, box)
    expect(dragged.pan).toEqual({x: 50, y: 20})
    const far = pinchTransform({...start, zoom: 2}, {distance: 100, mid: {x: 5000, y: 0}}, box)
    expect(far.pan.x).toBe(400)
  })

  it('has no pan at 100%', () => {
    expect(pinchTransform({...start, zoom: 2, pan: {x: 100, y: 0}}, {distance: 10, mid: {x: 100, y: 0}}, box).pan).toEqual({x: 0, y: 0})
  })
})

describe('zoomToSelection', () => {
  const box = {width: 800, height: 400}
  const home = {zoom: 1, pan: {x: 0, y: 0}}

  it('zooms so that the selection fills the container', () => {
    const result = zoomToSelection({x: 200, y: 100, width: 400, height: 200}, home, box)
    expect(result?.zoom).toBe(2)
    expect(result?.pan).toEqual({x: 0, y: 0})
  })

  it('centres an off-centre selection', () => {
    // A 200x100 area in the top-left corner: 4x zoom, the picture moves right and down by the centre offset.
    const result = zoomToSelection({x: 0, y: 0, width: 200, height: 100}, home, box)
    expect(result?.zoom).toBe(4)
    expect(result?.pan).toEqual({x: 1200, y: 600})
  })

  it('takes the current zoom and pan into account', () => {
    // At 2x with the picture shifted left by 400 px, the on-screen centre shows the picture point at x = +200.
    const result = zoomToSelection({x: 300, y: 150, width: 200, height: 100}, {zoom: 2, pan: {x: -400, y: 0}}, box)
    expect(result?.zoom).toBe(4)
  })

  it('ignores accidental tiny selections', () => {
    expect(zoomToSelection({x: 10, y: 10, width: 5, height: 80}, home, box)).toBeNull()
  })
})
