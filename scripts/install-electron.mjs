#!/usr/bin/env node
import {spawnSync} from 'child_process'
import {createRequire} from 'module'
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'fs'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const electronDir = join(root, 'node_modules/electron')
const installScript = join(electronDir, 'install.js')
const pathFile = join(electronDir, 'path.txt')

function getPlatformPath() {
  switch (process.platform) {
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron'
    case 'linux':
      return 'electron'
    case 'win32':
      return 'electron.exe'
    default:
      throw new Error(`Electron builds are not available on platform: ${process.platform}`)
  }
}

function isElectronInstalled() {
  const platformPath = getPlatformPath()

  try {
    const {version} = require(join(electronDir, 'package.json'))

    if (readFileSync(join(electronDir, 'dist', 'version'), 'utf8').replace(/^v/, '') !== version) {
      return false
    }

    if (readFileSync(pathFile, 'utf8') !== platformPath) {
      return false
    }
  } catch {
    return false
  }

  const electronPath = process.env.ELECTRON_OVERRIDE_DIST_PATH
    || join(electronDir, 'dist', platformPath)

  return existsSync(electronPath)
}

function tryStandardInstall() {
  console.log('Downloading Electron binary...')
  const result = spawnSync(process.execPath, [installScript], {
    cwd: root,
    stdio: 'inherit',
  })

  return result.status === 0
}

async function installWithPowerShell() {
  const {downloadArtifact} = require('@electron/get')
  const {version} = require(join(electronDir, 'package.json'))
  const platformPath = getPlatformPath()
  const distPath = join(electronDir, 'dist')

  console.log('Installing Electron binary (PowerShell fallback)...')

  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.env.ELECTRON_INSTALL_PLATFORM || process.platform,
    arch: process.env.ELECTRON_INSTALL_ARCH || process.arch,
    checksums: require(join(electronDir, 'checksums.json')),
  })

  mkdirSync(distPath, {recursive: true})

  const escapedZipPath = zipPath.replace(/'/g, "''")
  const escapedDistPath = distPath.replace(/'/g, "''")
  const result = spawnSync('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath '${escapedZipPath}' -DestinationPath '${escapedDistPath}' -Force`,
  ], {
    cwd: root,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  const srcTypeDefPath = join(distPath, 'electron.d.ts')
  const targetTypeDefPath = join(electronDir, 'electron.d.ts')

  if (existsSync(srcTypeDefPath)) {
    renameSync(srcTypeDefPath, targetTypeDefPath)
  }

  writeFileSync(pathFile, platformPath)
}

if (isElectronInstalled()) {
  process.exit(0)
}

if (tryStandardInstall() || isElectronInstalled()) {
  process.exit(0)
}

if (process.platform === 'win32') {
  await installWithPowerShell()

  if (!isElectronInstalled()) {
    console.error('Electron binary installation failed.')
    process.exit(1)
  }

  process.exit(0)
}

console.error(
  'Electron binary installation failed. Delete node_modules/electron and run "npx install-electron --no" manually.',
)
process.exit(1)
