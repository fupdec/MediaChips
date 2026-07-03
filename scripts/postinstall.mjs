#!/usr/bin/env node
import {spawnSync} from 'child_process'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function run(command, args = []) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run('npm', ['rebuild', 'better-sqlite3'])
run('node', ['scripts/ensure-electron-native.mjs'])
run('node', ['scripts/compile.mjs', 'artifacts'])
