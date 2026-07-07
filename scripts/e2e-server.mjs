#!/usr/bin/env node
import {spawn, spawnSync} from 'child_process'
import {createConnection} from 'node:net'
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const E2E_PORT = 12321
const E2E_CONFIG_PATH = join(root, 'public/config.json')

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({host: '127.0.0.1', port})
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

async function ensurePortAvailable() {
  if (await isPortInUse(E2E_PORT)) {
    console.error(`Port ${E2E_PORT} is already in use. Stop MediaChips/Electron before running E2E tests.`)
    console.error(`Find the process: lsof -i :${E2E_PORT}`)
    process.exit(1)
  }
}

function run(command, args = []) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function ensureE2eConfig() {
  mkdirSync(dirname(E2E_CONFIG_PATH), {recursive: true})

  let config = null
  if (existsSync(E2E_CONFIG_PATH)) {
    try {
      config = JSON.parse(readFileSync(E2E_CONFIG_PATH, 'utf8'))
    } catch {
      config = null
    }
  }

  const databaseId = config?.databases?.[0]?.id || Date.now().toString(16)
  const baseConfig = config && Array.isArray(config.databases) ? config : {
    databases: [{
      id: databaseId,
      name: 'Default',
      active: true,
      createdAt: Date.now(),
    }],
  }

  writeFileSync(E2E_CONFIG_PATH, JSON.stringify({
    ...baseConfig,
    port: E2E_PORT,
    onboardingCompleted: '1',
    onboardingPaused: '0',
    onboardingStep: '0',
  }, null, 2))
}

await ensurePortAvailable()
if (!process.env.SKIP_E2E_BUILD) {
  run('npm', ['run', 'build:app'])
}
run('node', ['scripts/run-server.mjs', '--prepare'])
ensureE2eConfig()

const server = spawn('node', ['app/server.js'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: 'production',
  },
})

const shutdown = (signal) => {
  if (!server.killed) {
    server.kill(signal)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

server.on('exit', (code, signal) => {
  if (signal === 'SIGTERM' || signal === 'SIGINT') {
    process.exit(0)
  }
  process.exit(code ?? 1)
})
