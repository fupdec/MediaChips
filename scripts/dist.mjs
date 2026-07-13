#!/usr/bin/env node
import {mkdirSync, readFileSync, writeFileSync} from 'fs'
import {spawnSync} from 'child_process'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'
import {pruneNativeBinaries, resolveDistTarget} from './prune-native-binaries.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const sfwBuild = String(process.env.MEDIA_CHIPS_SFW || '').trim() === '1'
  || args.includes('--sfw')

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

function restoreSfwCompiledTsSource() {
  // Compile bakes SFW_COMPILED into shared/sfwCompiled.js for the asar.
  // Reset the .ts source so the working tree does not stay dirty after dist:sfw.
  writeFileSync(
    join(root, 'shared/sfwCompiled.ts'),
    [
      '/**',
      ' * Overwritten by `scripts/compile.mjs` when MEDIA_CHIPS_SFW=1.',
      ' * Packaged Electron apps do not inherit that env var, so the flag must be baked in.',
      ' */',
      'export const SFW_COMPILED = false',
      '',
    ].join('\n'),
    'utf8',
  )
}

const target = resolveDistTarget(args)
const childEnv = {
  ...process.env,
  ...(sfwBuild ? {MEDIA_CHIPS_SFW: '1'} : {}),
}

if (sfwBuild) {
  console.log('[dist] MEDIA_CHIPS_SFW=1 — adult plugin stripped from this build')
}

run('node', ['scripts/compile.mjs', 'artifacts'], childEnv)
if (sfwBuild) {
  restoreSfwCompiledTsSource()
  const baked = readFileSync(join(root, 'shared/sfwCompiled.js'), 'utf8')
  if (!/\bSFW_COMPILED\s*=\s*true\b/.test(baked) && !/exports\.SFW_COMPILED\s*=\s*true/.test(baked)) {
    console.error('[dist] shared/sfwCompiled.js was not baked with SFW_COMPILED=true')
    process.exit(1)
  }
  console.log('[dist] verified shared/sfwCompiled.js has SFW_COMPILED=true')
}
run('npm', ['run', 'build:app'], childEnv)
run('node', ['.scripts-build/download-parser-model.js'], childEnv)
run('node', ['scripts/ensure-electron-native.mjs', '--force'], childEnv)
pruneNativeBinaries(target)

const builderArgs = ['electron-builder']
const publish = readOption('--publish', 'never')

if (readFlag('--dir')) {
  builderArgs.push('--dir')
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

if (sfwBuild) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const config = {
    ...pkg.build,
    productName: `${pkg.build.productName || 'MediaChips'} SFW`,
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
  const configDir = join(root, '.cache')
  mkdirSync(configDir, {recursive: true})
  const configPath = join(configDir, 'electron-builder.sfw.json')
  writeFileSync(configPath, JSON.stringify(config, null, 2))
  builderArgs.push('--config', configPath)
}

run('npx', builderArgs, childEnv)
