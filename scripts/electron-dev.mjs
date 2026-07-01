#!/usr/bin/env node
import {spawn, spawnSync} from 'child_process'
import {createConnection} from 'net'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'
import chokidar from 'chokidar'
import {ensurePreferredNodeOrExit} from './resolve-node.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
ensurePreferredNodeOrExit(root)

const vitePort = Number(process.env.VITE_DEV_SERVER_PORT || 3000)
const watchPaths = [
  'main.ts',
  'electron/**/*.ts',
  'app/**/*.ts',
  'api/**/*.ts',
  'shared/**/*.ts',
]

let viteProc = null
let electronProc = null
let rebuildTimer = null
let rebuildInFlight = false
let restartPending = false
let shuttingDown = false
const pendingChanges = new Set()

function runSync(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function waitForPort(port, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()

    const tryConnect = () => {
      const socket = createConnection({port, host: '127.0.0.1'})

      socket.once('connect', () => {
        socket.end()
        resolve()
      })

      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Vite dev server did not start on port ${port}`))
          return
        }
        setTimeout(tryConnect, 200)
      })
    }

    tryConnect()
  })
}

function killProcess(proc, signal = 'SIGTERM') {
  if (!proc || proc.killed || proc.exitCode != null) return
  proc.kill(signal)
}

function startVite() {
  viteProc = spawn('npm', ['run', 'dev'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      VITE_DEV_SERVER_PORT: String(vitePort),
    },
  })
}

function startElectron() {
  killProcess(electronProc)
  electronProc = spawn('npx', ['electron', '.'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      MEDIA_CHIPS_VITE_DEV: '1',
      VITE_DEV_SERVER_PORT: String(vitePort),
    },
  })

  electronProc.on('exit', (code, signal) => {
    electronProc = null
    if (shuttingDown || restartPending) return
    if (signal === 'SIGTERM' || signal === 'SIGINT') return
    cleanup(code ?? 0)
  })
}

function classifyChange(filePath) {
  if (filePath === 'main.ts') return 'main'
  if (filePath.startsWith('electron/')) return 'electron'
  if (filePath.startsWith('shared/')) return 'shared'
  if (filePath.startsWith('app/')) return 'app'
  if (filePath.startsWith('api/')) return 'api'
  return null
}

function resolveIncrementalBuildScripts(changedPaths) {
  const groups = new Set()

  for (const filePath of changedPaths) {
    const group = classifyChange(filePath)
    if (group) groups.add(group)
  }

  const sequential = []
  const parallel = []

  if (groups.has('shared')) sequential.push('shared')
  if (groups.has('main')) parallel.push('main')
  if (groups.has('electron')) parallel.push('electron')
  if (groups.has('app')) parallel.push('app')
  if (groups.has('api')) parallel.push('api')

  return {sequential, parallel}
}

function runCompileTarget(target) {
  runSync('node', ['scripts/compile.mjs', target])
}

function runCompileParallel(targets) {
  if (!targets.length) return

  if (targets.length === 1) {
    runCompileTarget(targets[0])
    return
  }

  runSync('node', ['scripts/compile.mjs', '--parallel', ...targets])
}

async function rebuildBackend(changedPaths = []) {
  if (rebuildInFlight) return
  rebuildInFlight = true
  restartPending = true

  try {
    const {sequential, parallel} = changedPaths.length
      ? resolveIncrementalBuildScripts(changedPaths)
      : {
        sequential: ['shared'],
        parallel: ['electron', 'main', 'app', 'api'],
      }

    const label = changedPaths.length
      ? changedPaths.join(', ')
      : 'full backend'

    console.log(`\n[electron-dev] rebuilding (${label})...`)
    killProcess(electronProc)
    await new Promise((resolve) => setTimeout(resolve, 300))

    for (const target of sequential) {
      runCompileTarget(target)
    }
    runCompileParallel(parallel)

    if (!shuttingDown) {
      console.log('[electron-dev] restarting electron...')
      restartPending = false
      startElectron()
    }
  } finally {
    rebuildInFlight = false
    restartPending = false
  }
}

function scheduleBackendRebuild(filePath) {
  if (shuttingDown) return
  pendingChanges.add(filePath)
  clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(() => {
    const changes = [...pendingChanges]
    pendingChanges.clear()
    rebuildBackend(changes).catch((error) => {
      console.error('[electron-dev] rebuild failed:', error)
    })
  }, 1000)
}

function startBackendWatcher() {
  const watcher = chokidar.watch(watchPaths, {
    cwd: root,
    ignoreInitial: true,
  })

  watcher.on('all', (event, filePath) => {
    if (!filePath || shuttingDown) return
    console.log(`[electron-dev] ${event} ${filePath}`)
    scheduleBackendRebuild(filePath)
  })

  return watcher
}

function cleanup(code = 0) {
  if (shuttingDown) return
  shuttingDown = true

  clearTimeout(rebuildTimer)
  killProcess(electronProc)
  killProcess(viteProc)

  setTimeout(() => process.exit(code), 100)
}

async function main() {
  console.log('[electron-dev] initial backend build...')
  runSync('node', ['scripts/compile.mjs', 'electron-artifacts'])
  runSync('node', ['scripts/ensure-electron-native.mjs'])

  console.log(`[electron-dev] starting Vite on port ${vitePort}...`)
  startVite()
  await waitForPort(vitePort)

  startElectron()
  startBackendWatcher()

  process.on('SIGINT', () => cleanup(0))
  process.on('SIGTERM', () => cleanup(0))
}

main().catch((error) => {
  console.error('[electron-dev] failed:', error)
  cleanup(1)
})
