#!/usr/bin/env node
import {existsSync, readdirSync, rmSync, statSync} from 'fs'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const TARGET_SPECS = {
  mac: {
    ffprobe: new Set(['darwin/arm64', 'darwin/x64']),
    onnxruntime: new Set(['darwin/arm64', 'darwin/x64']),
    sharpPackage: /^sharp-(darwin|libvips-darwin)-/,
  },
  win: {
    ffprobe: new Set(['win32/x64', 'win32/arm64', 'win32/ia32']),
    onnxruntime: new Set(['win32/x64', 'win32/arm64']),
    sharpPackage: /^sharp-(win32|libvips-win32)-/,
  },
  linux: {
    ffprobe: new Set(['linux/x64', 'linux/arm64']),
    onnxruntime: new Set(['linux/x64', 'linux/arm64']),
    sharpPackage: /^sharp-(linux|libvips-linux)-/,
  },
}

function readTargetArg(argv) {
  const index = argv.indexOf('--target')
  if (index === -1 || !argv[index + 1]) {
    console.error('Usage: node scripts/prune-native-binaries.mjs --target mac|win|linux')
    process.exit(1)
  }

  const target = argv[index + 1]
  if (!TARGET_SPECS[target]) {
    console.error(`Unknown target: ${target}`)
    process.exit(1)
  }

  return target
}

function dirSize(path) {
  if (!existsSync(path)) return 0

  let total = 0
  for (const entry of readdirSync(path, {withFileTypes: true})) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) {
      total += dirSize(child)
    } else if (entry.isFile()) {
      total += statSync(child).size
    }
  }
  return total
}

function removePath(path, label, removed) {
  if (!existsSync(path)) return

  const bytes = dirSize(path)
  rmSync(path, {recursive: true, force: true})
  removed.push({label, bytes})
}

function prunePlatformTree(baseDir, keepRelativePaths, removed, labelPrefix) {
  if (!existsSync(baseDir)) return

  for (const platform of readdirSync(baseDir)) {
    const platformDir = join(baseDir, platform)
    if (!statSync(platformDir).isDirectory()) continue

    for (const arch of readdirSync(platformDir)) {
      const archDir = join(platformDir, arch)
      if (!statSync(archDir).isDirectory()) continue

      const relative = `${platform}/${arch}`
      if (keepRelativePaths.has(relative)) continue

      removePath(archDir, `${labelPrefix}/${relative}`, removed)
    }

    if (existsSync(platformDir) && readdirSync(platformDir).length === 0) {
      rmSync(platformDir, {recursive: true, force: true})
    }
  }
}

function pruneSharpPackages(pattern, removed) {
  const imgDir = join(root, 'node_modules/@img')
  if (!existsSync(imgDir)) return

  for (const name of readdirSync(imgDir)) {
    if (!/^sharp(-libvips)?-/.test(name)) continue
    if (pattern.test(name)) continue
    removePath(join(imgDir, name), `@img/${name}`, removed)
  }
}

function pruneModels(removed) {
  const faceApiDir = join(root, 'models/face-api')
  removePath(faceApiDir, 'models/face-api', removed)
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export function resolveDistTarget(args, hostPlatform = process.platform) {
  if (args.includes('--mac')) return 'mac'
  if (args.includes('--win') || args.includes('--win-portable')) return 'win'
  if (args.includes('--linux')) return 'linux'

  if (hostPlatform === 'darwin') return 'mac'
  if (hostPlatform === 'win32') return 'win'
  if (hostPlatform === 'linux') return 'linux'

  console.error('Could not infer build target. Pass --mac, --win, or --linux.')
  process.exit(1)
}

export function pruneNativeBinaries(target) {
  const spec = TARGET_SPECS[target]
  const removed = []

  prunePlatformTree(
    join(root, 'node_modules/ffprobe-static/bin'),
    spec.ffprobe,
    removed,
    'ffprobe-static/bin',
  )

  prunePlatformTree(
    join(root, 'node_modules/onnxruntime-node/bin/napi-v3'),
    spec.onnxruntime,
    removed,
    'onnxruntime-node/bin/napi-v3',
  )

  pruneSharpPackages(spec.sharpPackage, removed)
  pruneModels(removed)

  const saved = removed.reduce((sum, entry) => sum + entry.bytes, 0)
  if (!removed.length) {
    console.log(`[prune-native-binaries] nothing to remove for target=${target}`)
    return {target, saved, removed}
  }

  console.log(`[prune-native-binaries] target=${target}, saved ${formatBytes(saved)}:`)
  for (const entry of removed) {
    console.log(`  - ${entry.label} (${formatBytes(entry.bytes)})`)
  }
  console.log('[prune-native-binaries] run npm install to restore pruned binaries for local dev')

  return {target, saved, removed}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const target = readTargetArg(process.argv.slice(2))
  pruneNativeBinaries(target)
}
