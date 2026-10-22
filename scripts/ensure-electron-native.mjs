#!/usr/bin/env node
import {spawnSync} from 'child_process'
import {createRequire} from 'module'
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'fs'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const force = process.argv.includes('--force')
const require = createRequire(import.meta.url)
const electronPath = require('electron')
const markerDir = join(root, 'node_modules/.cache')
const markerPath = join(markerDir, 'better-sqlite3-electron-abi')
const bindingPath = join(root, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node')

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function getElectronModulesVersion() {
  const result = spawnSync(
    electronPath,
    ['-p', 'process.versions.modules'],
    {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, ELECTRON_RUN_AS_NODE: '1'},
    },
  )

  if (result.status !== 0) {
    return null
  }

  return String(result.stdout).trim()
}

function canLoadNativeWithNode() {
  const result = spawnSync(
    process.execPath,
    ['-e', "require('better-sqlite3')"],
    {
      cwd: root,
      stdio: 'ignore',
    },
  )

  return result.status === 0
}

function hasElectronNativeBuild(electronAbi) {
  try {
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'))
    const bindingStat = statSync(bindingPath)

    return marker.abi === electronAbi
      && marker.mtimeMs === bindingStat.mtimeMs
      && marker.size === bindingStat.size
  } catch {
    return false
  }
}

function writeElectronNativeMarker(electronAbi) {
  const bindingStat = statSync(bindingPath)
  mkdirSync(markerDir, {recursive: true})
  writeFileSync(markerPath, JSON.stringify({
    abi: electronAbi,
    mtimeMs: bindingStat.mtimeMs,
    size: bindingStat.size,
  }), 'utf8')
}

const electronAbi = getElectronModulesVersion()
const nodeAbi = String(process.versions.modules)

if (!force && electronAbi && electronAbi === nodeAbi && canLoadNativeWithNode()) {
  console.log('electron native modules already built, skipping rebuild')
  process.exit(0)
}

if (!force && electronAbi && electronAbi !== nodeAbi && hasElectronNativeBuild(electronAbi)) {
  console.log(`electron native modules already built for ABI ${electronAbi}, skipping rebuild`)
  process.exit(0)
}

// electron-rebuild invokes node-gyp directly, bypassing cpu-features' install
// script. Cached/partially installed dependencies may lack its generated input.
const cpuFeaturesDir = join(root, 'node_modules/cpu-features')
const cpuFeaturesCheck = join(cpuFeaturesDir, 'buildcheck.js')
const cpuFeaturesGyp = join(cpuFeaturesDir, 'buildcheck.gypi')
if (existsSync(cpuFeaturesCheck) && !existsSync(cpuFeaturesGyp)) {
  const checked = spawnSync(process.execPath, ['buildcheck.js'], {cwd: cpuFeaturesDir, encoding: 'utf8'})
  if (checked.status !== 0) {
    console.error(checked.stderr || 'Failed to prepare cpu-features for Electron rebuild.')
    process.exit(checked.status ?? 1)
  }
  writeFileSync(cpuFeaturesGyp, checked.stdout)
}
run('npx', ['electron-rebuild', '-f', '-w', 'better-sqlite3'])
run('node', ['scripts/sign-native-modules.mjs'])

if (electronAbi) {
  writeElectronNativeMarker(electronAbi)
}
