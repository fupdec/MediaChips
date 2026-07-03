#!/usr/bin/env node
import {spawnSync} from 'child_process'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'
import {pruneNativeBinaries, resolveDistTarget} from './prune-native-binaries.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

function readFlag(name) {
  return args.includes(name)
}

function readOption(name, fallback) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

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

const target = resolveDistTarget(args)

run('node', ['scripts/compile.mjs', 'artifacts'])
run('npm', ['run', 'build:app'])
run('node', ['.scripts-build/download-parser-model.js'])
run('node', ['scripts/ensure-electron-native.mjs', '--force'])
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

run('npx', builderArgs)
