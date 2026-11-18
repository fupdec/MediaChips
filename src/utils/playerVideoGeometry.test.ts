import {describe, expect, it} from 'vitest'
import {isDefaultOrientation, playerVideoStyle, rotateBy, type PlayerVideoGeometry} from './playerVideoGeometry'

const base: PlayerVideoGeometry = {aspectMode: 'auto', rotation: 0, flipH: false, flipV: false}

describe('playerVideoGeometry', () => {
  it('rotates in quarter turns both ways', () => {
    expect(rotateBy(0, 90)).toBe(90)
    expect(rotateBy(270, 90)).toBe(0)
    expect(rotateBy(0, -90)).toBe(270)
    expect(rotateBy(90, -90)).toBe(0)
  })

  it('detects default orientation', () => {
    expect(isDefaultOrientation(base)).toBe(true)
    expect(isDefaultOrientation({...base, flipH: true})).toBe(false)
  })

  it('keeps the default and stretch/cover modes free of sizing', () => {
    expect(playerVideoStyle(base, 1000, 500)).toEqual({})
    expect(playerVideoStyle({...base, aspectMode: 'stretch'}, 1000, 500)).toEqual({objectFit: 'fill'})
    expect(playerVideoStyle({...base, aspectMode: 'cover'}, 1000, 500)).toEqual({objectFit: 'cover'})
  })

  it('swaps the box on a quarter turn so the rotated picture fills the container', () => {
    expect(playerVideoStyle({...base, rotation: 90}, 1000, 500)).toEqual({
      transform: 'rotate(90deg)', flex: 'none', alignSelf: 'center', width: '500px', height: '1000px',
    })
    expect(playerVideoStyle({...base, rotation: 180}, 1000, 500)).toEqual({transform: 'rotate(180deg)'})
  })

  it('applies flips on screen, after the rotation', () => {
    expect(playerVideoStyle({...base, flipH: true, rotation: 90}, 1000, 500).transform)
      .toBe('scale(-1, 1) rotate(90deg)')
  })

  it('fits a fixed ratio to the rotated picture', () => {
    expect(playerVideoStyle({...base, aspectMode: '4:3'}, 1000, 600)).toMatchObject({width: '800px', height: '600px', objectFit: 'fill'})
    expect(playerVideoStyle({...base, aspectMode: '4:3', rotation: 90}, 1000, 600)).toMatchObject({width: '600px', height: '800px'})
    expect(playerVideoStyle({...base, aspectMode: '4:3'}, 0, 0)).toEqual({objectFit: 'fill'})
  })

  it('puts zoom and pan outermost so they stay in screen space', () => {
    expect(playerVideoStyle({...base, zoom: 2, panX: 10, panY: -5, flipH: true, rotation: 90}, 1000, 500).transform)
      .toBe('translate(10px, -5px) scale(2) scale(-1, 1) rotate(90deg)')
    expect(playerVideoStyle({...base, zoom: 1.5}, 1000, 500)).toEqual({transform: 'scale(1.5)'})
  })
})
