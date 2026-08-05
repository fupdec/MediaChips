import {afterEach, describe, expect, it, vi} from 'vitest'
import {
  detectWheelDevice,
  getPrimaryWheelDelta,
  isMacOS,
  isWindows,
  normalizeWheelDelta,
  shouldUseWheelSeek,
} from './playerWheel'

function wheelEvent(partial: Partial<WheelEvent>): WheelEvent {
  return {
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...partial,
  } as WheelEvent
}

describe('playerWheel platform detection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('detects mac and windows from navigator', () => {
    vi.stubGlobal('navigator', {platform: 'MacIntel', userAgent: 'Mac'})
    expect(isMacOS()).toBe(true)
    expect(isWindows()).toBe(false)

    vi.stubGlobal('navigator', {platform: 'Win32', userAgent: 'Windows'})
    expect(isWindows()).toBe(true)
    expect(isMacOS()).toBe(false)
  })
})

describe('detectWheelDevice / normalizeWheelDelta', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses line mode profiles', () => {
    vi.stubGlobal('navigator', {platform: 'Win32', userAgent: 'Windows'})
    expect(detectWheelDevice(wheelEvent({deltaMode: 1, deltaY: 100}))).toBe('win-mouse')

    vi.stubGlobal('navigator', {platform: 'MacIntel', userAgent: 'Mac'})
    expect(detectWheelDevice(wheelEvent({deltaMode: 1, deltaY: 100}))).toBe('mac-mouse')
  })

  it('classifies pixel wheels by magnitude', () => {
    vi.stubGlobal('navigator', {platform: 'Win32', userAgent: 'Windows'})
    expect(detectWheelDevice(wheelEvent({deltaY: 10}))).toBe('win-fine')
    expect(detectWheelDevice(wheelEvent({deltaY: 80}))).toBe('win-mouse')
  })

  it('normalizes deltas and picks primary axis', () => {
    const event = wheelEvent({deltaMode: 1, deltaX: 1, deltaY: 2})
    expect(normalizeWheelDelta(event)).toEqual({deltaX: 16, deltaY: 32})
    expect(getPrimaryWheelDelta(event)).toBe(32)
  })
})

describe('shouldUseWheelSeek', () => {
  it('requires a modifier key', () => {
    expect(shouldUseWheelSeek(wheelEvent({}))).toBe(false)
    expect(shouldUseWheelSeek(wheelEvent({altKey: true}))).toBe(true)
    expect(shouldUseWheelSeek(wheelEvent({shiftKey: true}))).toBe(true)
  })
})
