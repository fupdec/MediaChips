#!/usr/bin/env node
import {spawn, spawnSync} from 'child_process'
import {createConnection} from 'node:net'
import {mkdtempSync, rmSync, writeFileSync} from 'fs'
import os from 'node:os'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const E2E_PORT = Number(process.env.MEDIA_CHIPS_E2E_PORT || 12321)
if (!Number.isInteger(E2E_PORT) || E2E_PORT < 1 || E2E_PORT > 65535) {
  throw new Error('MEDIA_CHIPS_E2E_PORT must be a valid TCP port')
}

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

function ensureE2eConfig(profile) {
  const databaseId = Date.now().toString(16)
  const baseConfig = {
    databases: [{
      id: databaseId,
      name: 'Default',
      active: true,
      createdAt: Date.now(),
    }],
  }

  writeFileSync(join(profile, 'config.json'), JSON.stringify({
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
// Never load or modify the developer's config, library, credentials or old jobs.
const profile = mkdtempSync(join(os.tmpdir(), 'mediachips-e2e-'))
ensureE2eConfig(profile)

const server = spawn('node', ['.backend-build/app/server.js'], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    MEDIA_CHIPS_DATA_DIR: profile,
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
  rmSync(profile, {recursive: true, force: true})
  if (signal === 'SIGTERM' || signal === 'SIGINT') {
    process.exit(0)
  }
  process.exit(code ?? 1)
})
