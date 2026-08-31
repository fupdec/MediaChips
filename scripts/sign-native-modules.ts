#!/usr/bin/env node
'use strict'

const {execFileSync} = require('child_process')
const fs = require('fs')
const path = require('path')

if (process.platform !== 'darwin') {
  process.exit(0)
}

const root = path.join(__dirname, '..')
const nativeModules = [
  'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  'node_modules/better-sqlite3/build/Release/test_extension.node',
  'node_modules/@parcel/watcher-darwin-arm64/watcher.node',
  'node_modules/@parcel/watcher-darwin-x64/watcher.node',
]

for (const relativePath of nativeModules) {
  const filePath = path.join(root, relativePath)
  if (!fs.existsSync(filePath)) {
    continue
  }

  execFileSync('codesign', ['--sign', '-', '--force', '--timestamp=none', filePath], {
    stdio: 'inherit',
  })
  console.log(`Signed ${relativePath}`)
}
