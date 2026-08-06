import {spawn, type ChildProcess} from 'child_process'
import fs from 'fs'
import path from 'path'

export type ServerProcessHandles = {
  child: ChildProcess | null
}

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
