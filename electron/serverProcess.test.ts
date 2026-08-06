/**
 * @vitest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {
  buildServerProcessEnv,
  resolveElectronDataDir,
  resolveServerScriptPath,
  startServerProcess,
  stopServerProcess,
  type ServerProcessHandles,
} from './serverProcess'

const tmpDirs: string[] = []

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true})
  }
  vi.restoreAllMocks()
})

describe('serverProcess helpers', () => {
  it('resolves .backend-build server script when present', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-server-script-'))
    tmpDirs.push(root)
    const script = path.join(root, '.backend-build', 'app', 'server.js')
    fs.mkdirSync(path.dirname(script), {recursive: true})
    fs.writeFileSync(script, 'module.exports = {}')
    expect(resolveServerScriptPath(root)).toBe(script)
  })

  it('builds child env with ELECTRON_RUN_AS_NODE and data/resources paths', () => {
    const env = buildServerProcessEnv({
      dataDir: '/data/dir',
      resourcesPath: '/resources',
      baseEnv: {PATH: '/bin', KEEP: '1'},
    })
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(env.MEDIA_CHIPS_DATA_DIR).toBe('/data/dir')
    expect(env.MEDIA_CHIPS_RESOURCES_PATH).toBe('/resources')
    expect(env.KEEP).toBe('1')
  })

  it('prefers portable dir for Electron data dir', () => {
    expect(resolveElectronDataDir({
      portableExecutableDir: '/portable',
      userDataPath: '/userData',
    })).toBe('/portable')
    expect(resolveElectronDataDir({
      userDataPath: '/userData',
    })).toBe('/userData')
  })

  it('spawns Electron execPath with the server script', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-server-spawn-'))
    tmpDirs.push(root)
    const script = path.join(root, '.backend-build', 'app', 'server.js')
    fs.mkdirSync(path.dirname(script), {recursive: true})
    fs.writeFileSync(script, 'module.exports = {}')

    const spawnImpl = vi.fn(() => {
      const child = {
        pid: 4242,
        on: vi.fn(),
        once: vi.fn(),
        kill: vi.fn(),
      }
      return child
    })

    const handles: ServerProcessHandles = {child: null}
    startServerProcess({
      appRoot: root,
      dataDir: '/data',
      resourcesPath: '/res',
      execPath: '/fake/electron',
      spawnImpl: spawnImpl as never,
      handles,
    })

    expect(spawnImpl).toHaveBeenCalledWith(
      '/fake/electron',
      [script],
      expect.objectContaining({
        cwd: root,
        env: expect.objectContaining({
          ELECTRON_RUN_AS_NODE: '1',
          MEDIA_CHIPS_DATA_DIR: '/data',
          MEDIA_CHIPS_RESOURCES_PATH: '/res',
        }),
      }),
    )
    expect(handles.child?.pid).toBe(4242)
  })

  it('uses taskkill on Windows stop', () => {
    const kill = vi.fn()
    const once = vi.fn()
    const handles: ServerProcessHandles = {
      child: {pid: 99, kill, once} as never,
    }
    const spawnImpl = vi.fn(() => ({on: vi.fn()}))
    stopServerProcess(handles, {
      platform: 'win32',
      spawnImpl: spawnImpl as never,
    })
    expect(spawnImpl).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '99', '/T', '/F'],
      expect.objectContaining({stdio: 'ignore'}),
    )
    expect(handles.child).toBeNull()
  })

  it('sends SIGTERM on posix stop', () => {
    const kill = vi.fn()
    const once = vi.fn()
    const handles: ServerProcessHandles = {
      child: {pid: 77, kill, once} as never,
    }
    stopServerProcess(handles, {
      platform: 'darwin',
      killGraceMs: 10,
    })
    expect(kill).toHaveBeenCalledWith('SIGTERM')
  })
})
