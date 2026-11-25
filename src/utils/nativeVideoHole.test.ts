import {describe, expect, it} from 'vitest'
import {nativeVideoHolePath} from './nativeVideoHole'

describe('nativeVideoHolePath', () => {
  const viewport = {width: 1280, height: 720}

  it('cuts the rectangle out of the viewport with an even-odd path', () => {
    expect(nativeVideoHolePath(viewport, {x: 100, y: 50, w: 800, h: 450}))
      .toBe("path(evenodd, 'M0 0H1280V720H0Z M100 50H900V500H100Z')")
  })

  it('rounds fractional layout values', () => {
    expect(nativeVideoHolePath(viewport, {x: 10.4, y: 20.6, w: 99.5, h: 49.5}))
      .toBe("path(evenodd, 'M0 0H1280V720H0Z M10 21H110V71H10Z')")
  })

  it('returns none for an empty rectangle so nothing is clipped', () => {
    expect(nativeVideoHolePath(viewport, {x: 0, y: 0, w: 0, h: 300})).toBe('none')
    expect(nativeVideoHolePath(viewport, {x: 0, y: 0, w: 300, h: 0})).toBe('none')
  })
})

describe('nativeVideoHolePath with rounded corners', () => {
  it('draws the hole with arcs and keeps the outer rectangle', () => {
    const path = nativeVideoHolePath({width: 1280, height: 720}, {x: 100, y: 50, w: 800, h: 450, r: 12})
    expect(path).toContain('M0 0H1280V720H0Z M112 50H888A12 12 0 0 1 900 62')
  })

  it('limits the radius to half of the shorter side', () => {
    expect(nativeVideoHolePath({width: 100, height: 100}, {x: 0, y: 0, w: 20, h: 10, r: 50})).toContain('A5 5')
  })
})
