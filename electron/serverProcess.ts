import {spawn, type ChildProcess} from 'child_process'
import fs from 'fs'
import path from 'path'

export type ServerProcessHandles = {
  child: ChildProcess | null
}

export const DEFAULT_RESPAWN_INITIAL_BACKOFF_MS = 500
export const DEFAULT_RESPAWN_MAX_BACKOFF_MS = 10_000
export const DEFAULT_RESPAWN_MAX_CONSECUTIVE = 20
/** After the child stays alive this long, consecutive crash counter resets. */
export const DEFAULT_RESPAWN_STABLE_MS = 30_000

export function resolveServerScriptPath(appRoot: string): string {
  const candidates = [
    path.join(appRoot, '.backend-build', 'app', 'server.js'),
    path.join(appRoot, 'app', 'server.js'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error(
    `MediaChips server script not found under ${appRoot} (expected .backend-build/app/server.js)`,
  )
}

export function buildServerProcessEnv(options: {
  dataDir: string
  resourcesPath?: string
  baseEnv?: NodeJS.ProcessEnv
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...(options.baseEnv || process.env),
    ELECTRON_RUN_AS_NODE: '1',
    MEDIA_CHIPS_DATA_DIR: options.dataDir,
  }
  const resourcesPath = options.resourcesPath?.trim()
  if (resourcesPath) {
    env.MEDIA_CHIPS_RESOURCES_PATH = resourcesPath
  }
  return env
}

export function resolveElectronDataDir(options: {
  portableExecutableDir?: string | null
  userDataPath: string
}): string {
  const portable = options.portableExecutableDir?.trim()
  if (portable) return portable
  return options.userDataPath
}

export function nextRespawnBackoffMs(
  previousMs: number,
  options: {initialMs?: number; maxMs?: number} = {},
): number {
  const initialMs = options.initialMs ?? DEFAULT_RESPAWN_INITIAL_BACKOFF_MS
  const maxMs = options.maxMs ?? DEFAULT_RESPAWN_MAX_BACKOFF_MS
  if (!Number.isFinite(previousMs) || previousMs <= 0) return initialMs
  return Math.min(maxMs, previousMs * 2)
}

/**
 * Spawn the Express API as a Node child of the Electron binary (ABI-matched natives).
 * Not detached — quit must call stopServerProcess.
 */
export function startServerProcess(options: {
  appRoot: string
  dataDir: string
  resourcesPath?: string
  execPath?: string
  spawnImpl?: typeof spawn
  handles?: ServerProcessHandles
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void
}): ChildProcess {
  const spawnImpl = options.spawnImpl || spawn
  const execPath = options.execPath || process.execPath
  const scriptPath = resolveServerScriptPath(options.appRoot)
  const env = buildServerProcessEnv({
    dataDir: options.dataDir,
    resourcesPath: options.resourcesPath,
  })

  const child = spawnImpl(execPath, [scriptPath], {
    cwd: options.appRoot,
    env,
    stdio: 'inherit',
    windowsHide: true,
  })

  if (options.handles) {
    options.handles.child = child
  }

  child.on('exit', (code, signal) => {
    if (options.handles && options.handles.child === child) {
      options.handles.child = null
    }
    options.onExit?.(code, signal)
  })

  return child
}

export function stopServerProcess(
  handles: ServerProcessHandles,
  options: {
    platform?: NodeJS.Platform
    spawnImpl?: typeof spawn
    killGraceMs?: number
  } = {},
): void {
  const child = handles.child
  if (!child?.pid) {
    handles.child = null
    return
  }

  const platform = options.platform || process.platform
  const spawnImpl = options.spawnImpl || spawn
  const pid = child.pid

  if (platform === 'win32') {
    try {
      spawnImpl('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
    } catch (error) {
      console.warn('Failed to taskkill API server process:', error)
      try {
        child.kill()
      } catch {
        // ignore
      }
    }
    handles.child = null
    return
  }

  try {
    child.kill('SIGTERM')
  } catch {
    // ignore
  }

  const graceMs = options.killGraceMs ?? 5000
  const timer = setTimeout(() => {
    if (handles.child !== child) return
    try {
      child.kill('SIGKILL')
    } catch {
      // ignore
    }
    handles.child = null
  }, graceMs)
  timer.unref?.()

  child.once('exit', () => {
    clearTimeout(timer)
    if (handles.child === child) handles.child = null
  })
}

export type ServerProcessSupervisor = {
  handles: ServerProcessHandles
  start: () => void
  stop: () => void
  /** Intentional restart (IPC / resume). Does not count as a crash respawn. */
  restart: () => Promise<boolean>
  isStopping: () => boolean
  getConsecutiveCrashRestarts: () => number
}

export function createServerProcessSupervisor(options: {
  appRoot: string
  dataDir: string
  resourcesPath?: string
  execPath?: string
  spawnImpl?: typeof spawn
  stopPlatform?: NodeJS.Platform
  handles?: ServerProcessHandles
  sleep?: (ms: number) => Promise<void>
  setTimeoutImpl?: typeof setTimeout
  clearTimeoutImpl?: typeof clearTimeout
  log?: (message: string) => void
  logError?: (message: string) => void
  initialBackoffMs?: number
  maxBackoffMs?: number
  maxConsecutiveRestarts?: number
  stableMs?: number
  /** Delay after stop before spawn during intentional restart (port release). */
  restartSettleMs?: number
}): ServerProcessSupervisor {
  const handles = options.handles || {child: null}
  const sleep = options.sleep || ((ms: number) => new Promise((resolve) => {
    setTimeout(resolve, ms)
  }))
  const setTimeoutImpl = options.setTimeoutImpl || setTimeout
  const clearTimeoutImpl = options.clearTimeoutImpl || clearTimeout
  const log = options.log || ((message: string) => console.log(message))
  const logError = options.logError || ((message: string) => console.error(message))
  const initialBackoffMs = options.initialBackoffMs ?? DEFAULT_RESPAWN_INITIAL_BACKOFF_MS
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_RESPAWN_MAX_BACKOFF_MS
  const maxConsecutiveRestarts = options.maxConsecutiveRestarts ?? DEFAULT_RESPAWN_MAX_CONSECUTIVE
  const stableMs = options.stableMs ?? DEFAULT_RESPAWN_STABLE_MS
  const restartSettleMs = options.restartSettleMs ?? 300

  let stopping = false
  let consecutiveCrashRestarts = 0
  let backoffMs = initialBackoffMs
  let respawnTimer: ReturnType<typeof setTimeout> | null = null
  let stableTimer: ReturnType<typeof setTimeout> | null = null
  let restartInFlight: Promise<boolean> | null = null

  function clearRespawnTimer() {
    if (respawnTimer) {
      clearTimeoutImpl(respawnTimer)
      respawnTimer = null
    }
  }

  function clearStableTimer() {
    if (stableTimer) {
      clearTimeoutImpl(stableTimer)
      stableTimer = null
    }
  }

  function markSpawnedStableWatch() {
    clearStableTimer()
    stableTimer = setTimeoutImpl(() => {
      stableTimer = null
      consecutiveCrashRestarts = 0
      backoffMs = initialBackoffMs
    }, stableMs)
    stableTimer.unref?.()
  }

  function spawnChild() {
    startServerProcess({
      appRoot: options.appRoot,
      dataDir: options.dataDir,
      resourcesPath: options.resourcesPath,
      execPath: options.execPath,
      spawnImpl: options.spawnImpl,
      handles,
      onExit: (code, signal) => {
        clearStableTimer()
        if (stopping) return

        logError(
          `MediaChips API server exited unexpectedly (code=${code}, signal=${signal})`,
        )

        if (consecutiveCrashRestarts >= maxConsecutiveRestarts) {
          logError(
            `MediaChips API auto-respawn stopped after ${maxConsecutiveRestarts} consecutive crashes`,
          )
          return
        }

        const delay = backoffMs
        backoffMs = nextRespawnBackoffMs(backoffMs, {
          initialMs: initialBackoffMs,
          maxMs: maxBackoffMs,
        })
        consecutiveCrashRestarts += 1

        clearRespawnTimer()
        respawnTimer = setTimeoutImpl(() => {
          respawnTimer = null
          if (stopping) return
          log(
            `[startup] API respawned (attempt ${consecutiveCrashRestarts}, backoff was ${delay}ms)`,
          )
          spawnChild()
        }, delay)
        respawnTimer.unref?.()
      },
    })
    markSpawnedStableWatch()
  }

  function start() {
    stopping = false
    if (handles.child) return
    clearRespawnTimer()
    spawnChild()
  }

  function stop() {
    stopping = true
    clearRespawnTimer()
    clearStableTimer()
    stopServerProcess(handles, {
      platform: options.stopPlatform,
      spawnImpl: options.spawnImpl,
    })
  }

  async function restart(): Promise<boolean> {
    if (restartInFlight) return restartInFlight

    restartInFlight = (async () => {
      stopping = true
      clearRespawnTimer()
      clearStableTimer()
      stopServerProcess(handles, {
        platform: options.stopPlatform,
        spawnImpl: options.spawnImpl,
      })

      const deadline = Date.now() + 5000
      while (handles.child && Date.now() < deadline) {
        await sleep(50)
      }
      if (restartSettleMs > 0) {
        await sleep(restartSettleMs)
      }

      consecutiveCrashRestarts = 0
      backoffMs = initialBackoffMs
      stopping = false
      spawnChild()
      log('[startup] API process restarted')
      return true
    })()

    try {
      return await restartInFlight
    } catch (error) {
      logError(
        `Failed to restart MediaChips API server: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return false
    } finally {
      restartInFlight = null
    }
  }

  return {
    handles,
    start,
    stop,
    restart,
    isStopping: () => stopping,
    getConsecutiveCrashRestarts: () => consecutiveCrashRestarts,
  }
}
