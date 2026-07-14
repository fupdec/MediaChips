#!/usr/bin/env node
/**
 * Packaging entry.
 *
 * Channels:
 * 1. **Standard** — adult bundled, requires activation key. `npm run dist`
 * 2. **SFW / store smoke** — adult not bundled; still requires key. `npm run dist:store`
 * 3. **Microsoft Store AppX** — adult not bundled + license bypass. `npm run dist:msstore`
 *    (`MEDIA_CHIPS_SFW=1` + `MEDIA_CHIPS_MSSTORE=1`)
 */
import {mkdirSync, readFileSync, writeFileSync} from 'fs'
import {spawnSync} from 'child_process'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'
import {pruneNativeBinaries, resolveDistTarget} from './prune-native-binaries.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
/** Microsoft Store AppX package (Partner Center). */
const msStoreTarget = args.includes('--msstore')
  || String(process.env.MEDIA_CHIPS_MSSTORE || '').trim() === '1'
const storeBuild = String(process.env.MEDIA_CHIPS_SFW || '').trim() === '1'
  || args.includes('--sfw')
  || args.includes('--store')
  || msStoreTarget

function readFlag(name) {
  return args.includes(name)
}

function readOption(name, fallback) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

function run(command, commandArgs = [], env = process.env) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function restoreCompiledFlagSources() {
  // Compile bakes flags into shared/*.js for the asar; reset .ts so the tree stays clean.
  writeFileSync(
    join(root, 'shared/sfwCompiled.ts'),
    [
      '/**',
      ' * Overwritten by `scripts/compile.mjs` when MEDIA_CHIPS_SFW=1 (adult-strip channel).',
      ' * Packaged Electron apps do not inherit that env var, so the flag must be baked in.',
      ' */',
      'export const SFW_COMPILED = false',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    join(root, 'shared/msStoreCompiled.ts'),
    [
      '/**',
      ' * Overwritten by `scripts/compile.mjs` when MEDIA_CHIPS_MSSTORE=1.',
      ' * Packaged AppX does not inherit that env var, so the flag must be baked in.',
      ' * Only Microsoft Store builds use this — not general SFW/smoke.',
      ' */',
      'export const MSSTORE_COMPILED = false',
      '',
    ].join('\n'),
    'utf8',
  )
}

const target = resolveDistTarget(args)
const childEnv = {
  ...process.env,
  ...(storeBuild ? {MEDIA_CHIPS_SFW: '1'} : {}),
  ...(msStoreTarget ? {MEDIA_CHIPS_SFW: '1', MEDIA_CHIPS_MSSTORE: '1'} : {}),
}

if (msStoreTarget) {
  console.log('[dist] Microsoft Store AppX — adult stripped + license bypass (MEDIA_CHIPS_MSSTORE=1)')
} else if (storeBuild) {
  console.log('[dist] SFW/store smoke (MEDIA_CHIPS_SFW=1) — adult not bundled; activation key still required')
} else {
  console.log('[dist] Standard channel — adult plugin bundled; activation key required')
}

run('node', ['scripts/compile.mjs', 'artifacts'], childEnv)
if (storeBuild || msStoreTarget) {
  restoreCompiledFlagSources()
  const bakedSfw = readFileSync(join(root, 'shared/sfwCompiled.js'), 'utf8')
  if (!/\bSFW_COMPILED\s*=\s*true\b/.test(bakedSfw) && !/exports\.SFW_COMPILED\s*=\s*true/.test(bakedSfw)) {
    console.error('[dist] shared/sfwCompiled.js was not baked with SFW_COMPILED=true')
    process.exit(1)
  }
  console.log('[dist] verified shared/sfwCompiled.js has SFW_COMPILED=true')
}
if (msStoreTarget) {
  const bakedMs = readFileSync(join(root, 'shared/msStoreCompiled.js'), 'utf8')
  if (!/\bMSSTORE_COMPILED\s*=\s*true\b/.test(bakedMs) && !/exports\.MSSTORE_COMPILED\s*=\s*true/.test(bakedMs)) {
    console.error('[dist] shared/msStoreCompiled.js was not baked with MSSTORE_COMPILED=true')
    process.exit(1)
  }
  console.log('[dist] verified shared/msStoreCompiled.js has MSSTORE_COMPILED=true')
}
run('npm', ['run', 'build:app'], childEnv)
run('node', ['.scripts-build/download-parser-model.js'], childEnv)
run('node', ['scripts/ensure-electron-native.mjs', '--force'], childEnv)
pruneNativeBinaries(target)

const builderArgs = ['electron-builder']
const publish = readOption('--publish', 'never')

if (readFlag('--dir')) {
  builderArgs.push('--dir')
} else if (msStoreTarget) {
  builderArgs.push('--win', 'appx')
} else if (readFlag('--win-portable')) {
  builderArgs.push('--win', 'portable')
} else if (readFlag('--win')) {
  builderArgs.push('--win')
} else if (readFlag('--mac')) {
  builderArgs.push('--mac')
} else if (readFlag('--linux')) {
  builderArgs.push('--linux')
} else if (target === 'mac') {
  builderArgs.push('--mac')
} else if (target === 'win') {
  builderArgs.push('--win')
} else if (target === 'linux') {
  builderArgs.push('--linux')
}

if (!readFlag('--dir')) {
  builderArgs.push('--publish', publish)
}

if (storeBuild || msStoreTarget) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const config = {
    ...pkg.build,
    // Keep display name "MediaChips" for Store listings; differentiate artifacts.
    productName: pkg.build.productName || 'MediaChips',
    files: [
      ...(pkg.build.files || []),
      '!packages/plugin-adult/**',
      '!node_modules/@mediachips/plugin-adult/**',
      '!api/plugins/adult/**',
      '!api/routes/Scraper.routes.js',
      '!api/controllers/Scraper.controller.js',
      '!api/services/theporndbApi.js',
      '!api/services/sceneScraperMarkers.js',
    ],
  }

  if (msStoreTarget) {
    config.win = {
      ...(pkg.build.win || {}),
      target: ['appx'],
      artifactName: '${productName}.v${version}.Windows.Store.${ext}',
    }
    config.appx = {
      ...(pkg.build.appx || {}),
      applicationId: pkg.build.appx?.applicationId || 'mediaChips',
      displayName: pkg.build.appx?.displayName || 'mediaChips',
      publisherDisplayName: pkg.build.appx?.publisherDisplayName || 'Vitaly Krivoshei',
      identityName: pkg.build.appx?.identityName || '38214VitalyKrivoshei.mediaChips',
      artifactName: '${productName}.v${version}.Windows.Store.${ext}',
    }
  } else if (storeBuild) {
    // Non-AppX store/SFW artifacts (e.g. smoke NSIS/dir) — mark in filename.
    if (config.win) {
      config.win = {
        ...config.win,
        artifactName: '${productName}.v${version}.Windows.StoreChannel.Installer.${ext}',
      }
    }
    if (config.portable) {
      config.portable = {
        ...config.portable,
        artifactName: '${productName}.v${version}.Windows.StoreChannel.Portable.${ext}',
      }
    }
    if (config.mac) {
      config.mac = {
        ...config.mac,
        artifactName: '${productName}.v${version}.Mac.StoreChannel.${arch}.${ext}',
      }
    }
    if (config.dmg) {
      config.dmg = {
        ...config.dmg,
        artifactName: '${productName}.v${version}.Mac.StoreChannel.${arch}.${ext}',
      }
    }
    if (config.linux) {
      config.linux = {
        ...config.linux,
        artifactName: '${productName}.v${version}.Linux.StoreChannel.AppImage',
      }
    }
  }

  const configDir = join(root, '.cache')
  mkdirSync(configDir, {recursive: true})
  const configPath = join(configDir, msStoreTarget ? 'electron-builder.msstore.json' : 'electron-builder.store.json')
  writeFileSync(configPath, JSON.stringify(config, null, 2))
  builderArgs.push('--config', configPath)
}

run('npx', builderArgs, childEnv)
