import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function canOpenSqlite() {
  try {
    const Database = require('better-sqlite3')
    const sqlite = new Database(':memory:')
    sqlite.close()
    return true
  } catch {
    return false
  }
}

function restoreElectronNativeBuild() {
  if (!existsSync(join(root, 'node_modules/electron'))) return

  console.log('Restoring better-sqlite3 for Electron after Node test rebuild...')
  const result = spawnSync('node', ['scripts/ensure-electron-native.mjs', '--force'], {
    cwd: root,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    console.error('Failed to rebuild better-sqlite3 for Electron.')
    process.exit(result.status ?? 1)
  }
}

if (!canOpenSqlite()) {
  console.log('better-sqlite3 is unavailable for the current Node runtime; rebuilding native binding...')
  const result = spawnSync('npm', ['rebuild', 'better-sqlite3'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    console.error('Failed to rebuild better-sqlite3 for tests.')
    process.exit(result.status ?? 1)
  }

  if (!canOpenSqlite()) {
    console.error('better-sqlite3 is still unavailable after rebuild.')
    process.exit(1)
  }

  restoreElectronNativeBuild()
}
