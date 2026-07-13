#!/usr/bin/env node
import {cpSync, existsSync, mkdirSync, readdirSync} from 'fs'
import {spawnSync} from 'child_process'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sfwBuild = String(process.env.MEDIA_CHIPS_SFW || '').trim() === '1'

const TARGETS = {
  shared: {
    tsc: 'tsconfig.shared-build.json',
    copy: () => copyDirContents(join(root, '.shared-build/shared'), join(root, 'shared')),
  },
  app: {
    tsc: 'tsconfig.app.json',
    copy: () => copyDirContents(join(root, '.app-build/app'), join(root, 'app')),
  },
  api: {
    tsc: sfwBuild ? 'tsconfig.api.sfw.json' : 'tsconfig.api.json',
    copy: () => {
      copyDirContents(join(root, '.api-build/api'), join(root, 'api'))
      if (sfwBuild) return
      const serverOut = join(root, '.api-build/packages/plugin-adult/src/server')
      if (existsSync(serverOut)) {
        copyDirContents(serverOut, join(root, 'packages/plugin-adult/src/server'))
      }
    },
  },
  electron: {
    tsc: 'tsconfig.electron.json',
    copy: () => copyJsFiles(join(root, '.electron-build/electron'), join(root, 'electron')),
  },
  main: {
    tsc: 'tsconfig.main.json',
    copy: () => cpSync(join(root, '.main-build/main.js'), join(root, 'main.js')),
  },
  scripts: {
    tsc: 'tsconfig.scripts.json',
  },
}

function copyDirContents(srcDir, destDir) {
  mkdirSync(destDir, {recursive: true})

  for (const entry of readdirSync(srcDir, {withFileTypes: true})) {
    const srcPath = join(srcDir, entry.name)
    const destPath = join(destDir, entry.name)

    if (entry.isDirectory()) {
      copyDirContents(srcPath, destPath)
      continue
    }

    cpSync(srcPath, destPath)
  }
}

function copyJsFiles(srcDir, destDir) {
  mkdirSync(destDir, {recursive: true})

  for (const entry of readdirSync(srcDir, {withFileTypes: true})) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) {
      continue
    }

    cpSync(join(srcDir, entry.name), join(destDir, entry.name))
  }
}

function runTsc(project) {
  const result = spawnSync('npx', ['tsc', '-p', project], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function runTarget(name) {
  const target = TARGETS[name]
  if (!target) {
    console.error(`Unknown compile target: ${name}`)
    console.error(`Available: ${Object.keys(TARGETS).join(', ')}, backend, electron-artifacts, artifacts`)
    process.exit(1)
  }

  runTsc(target.tsc)
  target.copy?.()
}

async function runParallel(names) {
  const {spawn} = await import('child_process')

  await Promise.all(names.map((name) => new Promise((resolve, reject) => {
    const target = TARGETS[name]
    if (!target) {
      reject(new Error(`Unknown compile target: ${name}`))
      return
    }

    const child = spawn(process.execPath, [join(root, 'scripts/compile.mjs'), name], {
      cwd: root,
      stdio: 'inherit',
    })

    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`compile ${name} failed with exit code ${code}`))
    })
  })))
}

async function runGroup(name) {
  switch (name) {
    case 'backend':
      runTarget('shared')
      await runParallel(['app', 'api'])
      return
    case 'electron-artifacts':
      await runParallel(['electron', 'main'])
      await runGroup('backend')
      return
    case 'artifacts':
      runTarget('scripts')
      await runGroup('electron-artifacts')
      return
    default:
      runTarget(name)
  }
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--')

  if (!args.length) {
    console.error('Usage: node scripts/compile.mjs <target> [target...]')
    console.error('       node scripts/compile.mjs --parallel <target> [target...]')
    process.exit(1)
  }

  if (args[0] === '--parallel') {
    await runParallel(args.slice(1))
    return
  }

  for (const arg of args) {
    await runGroup(arg)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
