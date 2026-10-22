#!/usr/bin/env node
import {spawnSync} from 'child_process'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Tests rebuild SQLite for Node; restore the Electron binding before launch.
const native = spawnSync(process.execPath, ['scripts/ensure-electron-native.mjs'], {
  cwd: root,
  stdio: 'inherit',
})
if (native.status !== 0) process.exit(native.status ?? 1)

const result = spawnSync('npx', ['electron', '.'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    MEDIA_CHIPS_VITE_DEV: '0',
  },
})

process.exit(result.status ?? 1)
