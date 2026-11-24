import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {EventEmitter} from 'node:events'

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  execFile: vi.fn(),
  /** Paths outside the temp dir that should look installed. */
  installed: new Set<string>(),
  tempDir: {value: ''},
}))

vi.mock('child_process', () => ({spawn: mocks.spawn, execFile: mocks.execFile}))
// Existence of anything outside the test's temp dir comes from `mocks.installed`, not from the machine.
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    access: async (target: string, mode?: number) => {
      if (mocks.tempDir.value && String(target).startsWith(mocks.tempDir.value)) return actual.access(target, mode)
      if (mocks.installed.has(String(target))) return
      throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'})
    },
  }
})

import {ExternalPlayerError, launchExternalPlayer, resolveIinaCli, resolveMpvBinary} from './externalPlayerLaunch'

let dir = ''
let mediaFile = ''
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!

function setPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {value, configurable: true})
}

/** `which`/`where` answers with the given stdout, or fails when null. */
function mockWhich(stdout: string | null) {
  mocks.execFile.mockImplementation((_bin: string, _args: string[], _opts: unknown, cb: (e: Error | null, r?: {stdout: string}) => void) => {
    if (stdout === null) cb(new Error('not found'))
    else cb(null, {stdout})
  })
}

function mockSpawn(options: {fail?: Error} = {}) {
  const child = Object.assign(new EventEmitter(), {unref: vi.fn()})
  mocks.spawn.mockImplementation(() => {
    if (options.fail) setImmediate(() => child.emit('error', options.fail))
    return child
  })
  return child
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-external-player-'))
  mocks.tempDir.value = dir
  mocks.installed.clear()
  mediaFile = path.join(dir, 'clip.mp4')
  fs.writeFileSync(mediaFile, 'x')
  mocks.spawn.mockReset()
  mocks.execFile.mockReset()
})

afterEach(() => {
  Object.defineProperty(process, 'platform', platformDescriptor)
  fs.rmSync(dir, {recursive: true, force: true})
})

describe('resolveMpvBinary', () => {
  it('uses the first line printed by which/where', async () => {
    mockWhich('\n  /usr/bin/mpv  \n/other/mpv\n')
    await expect(resolveMpvBinary()).resolves.toBe('/usr/bin/mpv')
  })

  it('falls back to the usual install locations when it is not on PATH', async () => {
    mockWhich(null)
    setPlatform('linux')
    mocks.installed.add('/usr/local/bin/mpv')
    await expect(resolveMpvBinary()).resolves.toBe('/usr/local/bin/mpv')
    setPlatform('darwin')
    mocks.installed.clear()
    mocks.installed.add('/opt/homebrew/bin/mpv')
    await expect(resolveMpvBinary()).resolves.toBe('/opt/homebrew/bin/mpv')
  })

  it('returns null when mpv is neither on PATH nor in the usual places', async () => {
    mockWhich(null)
    for (const platform of ['linux', 'darwin', 'win32'] as const) {
      setPlatform(platform)
      await expect(resolveMpvBinary()).resolves.toBeNull()
    }
  })
})

describe('resolveIinaCli', () => {
  it('is macOS only', async () => {
    setPlatform('linux')
    await expect(resolveIinaCli()).resolves.toBeNull()
    setPlatform('win32')
    await expect(resolveIinaCli()).resolves.toBeNull()
  })
})

describe('launchExternalPlayer', () => {
  it('requires a media path', async () => {
    await expect(launchExternalPlayer({player: 'mpv', mediaPath: '   '})).rejects.toMatchObject({code: 'NO_PATH'})
  })

  it('reports a missing file before looking for the player', async () => {
    await expect(launchExternalPlayer({player: 'mpv', mediaPath: path.join(dir, 'missing.mp4')}))
      .rejects.toMatchObject({code: 'FILE_NOT_FOUND'})
    expect(mocks.execFile).not.toHaveBeenCalled()
  })

  it('refuses IINA outside macOS', async () => {
    setPlatform('linux')
    await expect(launchExternalPlayer({player: 'iina', mediaPath: mediaFile}))
      .rejects.toMatchObject({code: 'UNSUPPORTED_PLATFORM'})
  })

  it('reports PLAYER_NOT_FOUND when mpv cannot be located', async () => {
    mockWhich(null)
    setPlatform('linux')
    const error = await launchExternalPlayer({player: 'mpv', mediaPath: mediaFile}).catch((e) => e)
    expect(error).toBeInstanceOf(ExternalPlayerError)
    expect(error.code).toBe('PLAYER_NOT_FOUND')
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('starts mpv detached with just the file when there are no chapters', async () => {
    mockWhich('/usr/bin/mpv\n')
    const child = mockSpawn()
    const result = await launchExternalPlayer({player: 'mpv', mediaPath: mediaFile})
    expect(result).toEqual({player: 'mpv', chapters: 0})
    expect(mocks.spawn).toHaveBeenCalledWith('/usr/bin/mpv', [mediaFile], expect.objectContaining({detached: true, stdio: 'ignore'}))
    expect(child.unref).toHaveBeenCalled()
  })

  it('writes an ffmetadata chapters file and passes it to mpv', async () => {
    mockWhich('/usr/bin/mpv\n')
    mockSpawn()
    const result = await launchExternalPlayer({
      player: 'mpv',
      mediaPath: mediaFile,
      chapters: [{title: 'Second', time: 20}, {title: 'First', time: 5}],
    })
    expect(result.chapters).toBe(2)
    const args = mocks.spawn.mock.calls[0][1] as string[]
    expect(args).toHaveLength(2)
    expect(args[1]).toBe(mediaFile)
    const match = /^--chapters-file=(.+)$/.exec(args[0])
    expect(match).not.toBeNull()
    const body = fs.readFileSync(match![1], 'utf8')
    expect(body.startsWith(';FFMETADATA1')).toBe(true)
    expect(body.indexOf('title=First')).toBeLessThan(body.indexOf('title=Second'))
    fs.rmSync(match![1], {force: true})
  })

  it('rejects when the player process fails to start', async () => {
    mockWhich('/usr/bin/mpv\n')
    mockSpawn({fail: new Error('spawn EACCES')})
    await expect(launchExternalPlayer({player: 'mpv', mediaPath: mediaFile})).rejects.toThrow('spawn EACCES')
  })

  it('starts IINA with --no-stdin before the file on macOS', async () => {
    setPlatform('darwin')
    const home = fs.mkdtempSync(path.join(dir, 'home-'))
    const cli = path.join(home, 'Applications/IINA.app/Contents/MacOS/iina-cli')
    fs.mkdirSync(path.dirname(cli), {recursive: true})
    fs.writeFileSync(cli, '')
    vi.spyOn(os, 'homedir').mockReturnValue(home)
    mocks.installed.add(cli)
    mockSpawn()
    const result = await launchExternalPlayer({player: 'iina', mediaPath: mediaFile})
    expect(result).toEqual({player: 'iina', chapters: 0})
    expect(mocks.spawn).toHaveBeenCalledWith(cli, ['--no-stdin', mediaFile], expect.any(Object))
    vi.restoreAllMocks()
  })

  it('reports PLAYER_NOT_FOUND when IINA is not installed', async () => {
    setPlatform('darwin')
    await expect(launchExternalPlayer({player: 'iina', mediaPath: mediaFile}))
      .rejects.toMatchObject({code: 'PLAYER_NOT_FOUND'})
  })
})
