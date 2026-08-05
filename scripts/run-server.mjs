#!/usr/bin/env node
import {spawnSync} from 'child_process'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const prepareOnly = args.has('--prepare')

function run(command, commandArgs = []) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run('node', ['scripts/compile.mjs', 'backend'])
run('npm', ['rebuild', 'better-sqlite3'])

if (prepareOnly) {
  process.exit(0)
}

const env = {...process.env}
if (args.has('--lan')) {
  env.MEDIA_CHIPS_ALLOW_LAN = '1'
}

const result = spawnSync('node', ['.backend-build/app/server.js'], {
  cwd: root,
  stdio: 'inherit',
  env,
})

process.exit(result.status ?? 1)
