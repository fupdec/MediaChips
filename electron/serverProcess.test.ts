/**
 * @vitest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {
  buildServerProcessEnv,
  createServerProcessSupervisor,
  nextRespawnBackoffMs,
  resolveElectronDataDir,
  resolveServerProcessCwd,
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

function makeAppRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-server-supervisor-'))
  tmpDirs.push(root)
  const script = path.join(root, '.backend-build', 'app', 'server.js')
  fs.mkdirSync(path.dirname(script), {recursive: true})
  fs.writeFileSync(script, 'module.exports = {}')
  return root
}

type FakeChild = {
  pid: number
  on: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  emitExit: (code: number | null, signal: NodeJS.Signals | null) => void
}

function createFakeSpawn() {
  let nextPid = 1000
  const children: FakeChild[] = []
  const spawnImpl = vi.fn((command: string) => {
    if (command === 'taskkill') {
      return {on: vi.fn(), once: vi.fn(), kill: vi.fn()}
    }

    const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
    const child: FakeChild = {
      pid: nextPid++,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        const list = listeners.get(event) || []
        list.push(handler)
        listeners.set(event, list)
        return child
      }),
      once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        const list = listeners.get(event) || []
        list.push(handler)
        listeners.set(event, list)
        return child
      }),
      kill: vi.fn(),
      emitExit: (code, signal) => {
        for (const handler of listeners.get('exit') || []) {
          handler(code, signal)
        }
      },
    }
    children.push(child)
    return child
  })
  return {spawnImpl, children}
}

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

  it('uses a real directory cwd when appRoot is inside an asar archive', () => {
    const root = path.join(path.sep, 'App', 'Contents', 'Resources')
    const asarPath = path.join(root, 'app.asar')
    expect(resolveServerProcessCwd(asarPath)).toBe(root)
    expect(resolveServerProcessCwd(path.join(asarPath, 'electron'))).toBe(root)
    expect(resolveServerProcessCwd(path.join(root, 'unpacked'))).toBe(
      path.normalize(path.join(root, 'unpacked')),
    )
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

  it('spawns with parent cwd when appRoot is an asar file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-server-spawn-asar-'))
    tmpDirs.push(root)
    const asarFile = path.join(root, 'app.asar')
    fs.writeFileSync(asarFile, 'asar')
    const script = path.join(asarFile, '.backend-build', 'app', 'server.js')
    const existsSync = vi.spyOn(fs, 'existsSync').mockImplementation((target) => {
      return path.resolve(String(target)) === path.resolve(script)
    })

    const spawnImpl = vi.fn(() => ({
      pid: 4243,
      on: vi.fn(),
      once: vi.fn(),
      kill: vi.fn(),
    }))

    startServerProcess({
      appRoot: asarFile,
      dataDir: '/data',
      execPath: '/fake/electron',
      spawnImpl: spawnImpl as never,
    })

    expect(spawnImpl).toHaveBeenCalledWith(
      '/fake/electron',
      [script],
      expect.objectContaining({cwd: root}),
    )
    existsSync.mockRestore()
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

  it('doubles respawn backoff until the cap', () => {
    expect(nextRespawnBackoffMs(0)).toBe(500)
    expect(nextRespawnBackoffMs(500)).toBe(1000)
    expect(nextRespawnBackoffMs(1000)).toBe(2000)
    expect(nextRespawnBackoffMs(8000)).toBe(10000)
    expect(nextRespawnBackoffMs(10000)).toBe(10000)
  })
})

describe('createServerProcessSupervisor', () => {
  it('respawns after unexpected exit with backoff and does not respawn after stop', async () => {
    const root = makeAppRoot()
    const {spawnImpl, children} = createFakeSpawn()
    const scheduled: Array<{ms: number; fn: () => void}> = []
    const setTimeoutImpl = vi.fn((fn: () => void, ms?: number) => {
      const handle = {unref: vi.fn()}
      scheduled.push({ms: ms ?? 0, fn})
      return handle as unknown as ReturnType<typeof setTimeout>
    }) as unknown as typeof setTimeout
    const clearTimeoutImpl = vi.fn()

    const supervisor = createServerProcessSupervisor({
      appRoot: root,
      dataDir: '/data',
      execPath: '/fake/electron',
      spawnImpl: spawnImpl as never,
      setTimeoutImpl,
      clearTimeoutImpl,
      sleep: async () => {},
      restartSettleMs: 0,
      stableMs: 60_000,
      initialBackoffMs: 500,
      maxBackoffMs: 10_000,
    })

    supervisor.start()
    expect(spawnImpl).toHaveBeenCalledTimes(1)

    children[0].emitExit(1, null)
    expect(supervisor.getConsecutiveCrashRestarts()).toBe(1)

    const respawn = scheduled.find((entry) => entry.ms === 500)
    expect(respawn).toBeTruthy()
    respawn!.fn()
    expect(spawnImpl).toHaveBeenCalledTimes(2)
    expect(children[1].pid).not.toBe(children[0].pid)

    children[1].emitExit(1, null)
    expect(supervisor.getConsecutiveCrashRestarts()).toBe(2)
    const second = scheduled.find((entry) => entry.ms === 1000)
    expect(second).toBeTruthy()

    supervisor.stop()
    const before = spawnImpl.mock.calls.length
    // Any pending respawn callbacks must no-op after stop.
    second!.fn()
    expect(spawnImpl.mock.calls.length).toBe(before)
    expect(supervisor.isStopping()).toBe(true)
  })

  it('intentional restart does not count as a crash respawn', async () => {
    const root = makeAppRoot()
    const {spawnImpl, children} = createFakeSpawn()
    const setTimeoutImpl = vi.fn((fn: () => void) => {
      const handle = {unref: vi.fn()}
      // Ignore stable/backoff timers for this test.
      void fn
      return handle as unknown as ReturnType<typeof setTimeout>
    }) as unknown as typeof setTimeout

    const supervisor = createServerProcessSupervisor({
      appRoot: root,
      dataDir: '/data',
      execPath: '/fake/electron',
      spawnImpl: spawnImpl as never,
      stopPlatform: 'win32',
      setTimeoutImpl,
      clearTimeoutImpl: vi.fn(),
      sleep: async () => {},
      restartSettleMs: 0,
      stableMs: 60_000,
    })

    supervisor.start()
    expect(spawnImpl).toHaveBeenCalledTimes(1)

    const ok = await supervisor.restart()
    expect(ok).toBe(true)
    const electronSpawns = spawnImpl.mock.calls.filter((call) => call[0] === '/fake/electron')
    expect(electronSpawns).toHaveLength(2)
    expect(supervisor.getConsecutiveCrashRestarts()).toBe(0)
    expect(children).toHaveLength(2)
  })
})
