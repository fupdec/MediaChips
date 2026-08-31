#!/usr/bin/env node
import {execFileSync} from 'child_process'
import {existsSync} from 'fs'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'

if (process.platform !== 'darwin') {
  process.exit(0)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nativeModules = [
  'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  'node_modules/better-sqlite3/build/Release/test_extension.node',
  'node_modules/@parcel/watcher-darwin-arm64/watcher.node',
  'node_modules/@parcel/watcher-darwin-x64/watcher.node',
]

for (const relativePath of nativeModules) {
  const filePath = join(root, relativePath)
  if (!existsSync(filePath)) {
    continue
  }

  execFileSync('codesign', ['--sign', '-', '--force', '--timestamp=none', filePath], {
    stdio: 'inherit',
  })
  console.log(`Signed ${relativePath}`)
}
