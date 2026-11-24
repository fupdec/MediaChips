import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createEventThrottle, isNativePlayerEnabled, resolveLibmpvPath, resolveMpvAddonPath} from './mpvNative'

describe('isNativePlayerEnabled', () => {
  it('is off unless the setting or the dev variable turns it on', () => {
    expect(isNativePlayerEnabled({}, 'darwin', {})).toBe(false)
    expect(isNativePlayerEnabled({nativePlayer: '0'}, 'darwin', {})).toBe(false)
  })
  it('turns on from the stored setting or MC_NATIVE_PLAYER', () => {
    expect(isNativePlayerEnabled({nativePlayer: '1'}, 'darwin', {})).toBe(true)
    expect(isNativePlayerEnabled({}, 'darwin', {MC_NATIVE_PLAYER: '1'})).toBe(true)
  })
  it('is available on macOS and Windows only', () => {
    expect(isNativePlayerEnabled({nativePlayer: '1'}, 'win32', {})).toBe(true)
    expect(isNativePlayerEnabled({}, 'win32', {})).toBe(false)
    expect(isNativePlayerEnabled({nativePlayer: '1'}, 'linux', {MC_NATIVE_PLAYER: '1'})).toBe(false)
  })
  it('tolerates a missing config', () => {
    expect(isNativePlayerEnabled(null, 'darwin', {})).toBe(false)
    expect(isNativePlayerEnabled(undefined, 'darwin', {MC_NATIVE_PLAYER: '1'})).toBe(true)
  })
})

describe('bundled native player resolution', () => {
  let dir: string
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpv-resolve-')) })
  afterEach(() => { fs.rmSync(dir, {recursive: true, force: true}) })

  const touch = (...parts: string[]) => {
    const file = path.join(dir, ...parts)
    fs.mkdirSync(path.dirname(file), {recursive: true})
    fs.writeFileSync(file, '')
    return file
  }

  it('finds the addon in the packaged resources folder', () => {
    const addon = touch('Resources', 'mpv', 'mpvview.node')
    expect(resolveMpvAddonPath(path.join(dir, 'no-such-root'), path.join(dir, 'Resources'))).toBe(addon)
  })
  it('prefers the development build next to the sources', () => {
    const dev = touch('root', 'native', 'mpv-view', 'build', 'Release', 'mpvview.node')
    touch('Resources', 'mpv', 'mpvview.node')
    expect(resolveMpvAddonPath(path.join(dir, 'root'), path.join(dir, 'Resources'))).toBe(dev)
  })
  it('returns null when no addon exists', () => {
    expect(resolveMpvAddonPath(path.join(dir, 'root'), path.join(dir, 'Resources'))).toBeNull()
  })

  it('uses MPV_LIB first, then the bundled copy', () => {
    const override = touch('custom', 'libmpv.dylib')
    const bundled = touch('Resources', 'mpv', 'libmpv.2.dylib')
    expect(resolveLibmpvPath(path.join(dir, 'Resources'), {MPV_LIB: override})).toBe(override)
    expect(resolveLibmpvPath(path.join(dir, 'Resources'), {})).toBe(bundled)
  })
  it('looks for libmpv-2.dll on Windows', () => {
    const override = touch('custom', 'libmpv-2.dll')
    const bundled = touch('Resources', 'mpv', 'libmpv-2.dll')
    expect(resolveLibmpvPath(path.join(dir, 'Resources'), {MPV_LIB: override}, 'win32')).toBe(override)
    expect(resolveLibmpvPath(path.join(dir, 'Resources'), {}, 'win32')).toBe(bundled)
  })
})

describe('readTracks', () => {
  it('reads the mpv track list property by property', async () => {
    const {readTracks} = await import('./mpvNative')
    const values: Record<string, string> = {
      'track-list/count': '3',
      'track-list/0/type': 'video', 'track-list/0/id': '1', 'track-list/0/codec': 'h264',
      'track-list/1/type': 'audio', 'track-list/1/id': '1', 'track-list/1/lang': 'eng', 'track-list/1/codec': 'ac3',
      'track-list/1/selected': 'yes', 'track-list/1/default': 'yes',
      'track-list/2/type': 'sub', 'track-list/2/id': '2', 'track-list/2/title': 'Signs', 'track-list/2/external': 'yes',
    }
    const tracks = readTracks(name => values[name] ?? null)
    expect(tracks).toHaveLength(3)
    expect(tracks[1]).toMatchObject({id: 1, type: 'audio', lang: 'eng', codec: 'ac3', selected: true, default: true})
    expect(tracks[2]).toMatchObject({id: 2, type: 'sub', title: 'Signs', external: true, selected: false})
  })

  it('returns an empty list when nothing is loaded', async () => {
    const {readTracks} = await import('./mpvNative')
    expect(readTracks(() => null)).toEqual([])
  })
})

describe('createEventThrottle', () => {
  it('forwards the first value, coalesces bursts and delivers the latest one', () => {
    vi.useFakeTimers()
    const sent: string[] = []
    const push = createEventThrottle(json => sent.push(json), () => Date.now())
    const tick = (value: number) => `{"event":"property-change","name":"time-pos","data":${value}}`
    vi.setSystemTime(1_000)
    push(tick(1))
    vi.setSystemTime(1_020)
    push(tick(2))
    push(tick(3))
    expect(sent).toEqual([tick(1)])
    vi.advanceTimersByTime(100)
    expect(sent).toEqual([tick(1), tick(3)])
    push('{"event":"file-loaded"}')
    expect(sent[sent.length - 1]).toBe('{"event":"file-loaded"}')
    vi.useRealTimers()
  })
})
