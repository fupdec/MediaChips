#!/usr/bin/env node
// A persistent, isolated profile: rerun with the same directory to test restart.
import {mkdirSync, existsSync, writeFileSync} from 'node:fs'
import {resolve, join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = process.argv[2]
if (!directory || !resolve(directory).startsWith('/tmp/mc-cloud-acceptance-')) {
  throw new Error('Pass a dedicated /tmp/mc-cloud-acceptance-<name> directory. Never pass a user profile.')
}
const dataDir = resolve(directory)
mkdirSync(dataDir, {recursive: true, mode: 0o700})
const marker = join(dataDir, '.cloud-acceptance-profile')
const config = join(dataDir, 'config.json')
if (existsSync(config) && !existsSync(marker)) throw new Error('Refusing an existing unmarked profile.')
if (!existsSync(config)) {
  writeFileSync(config, JSON.stringify({port: 12331, databases: [{id: 'cloud-acceptance', name: 'Cloud acceptance ONLY', active: true, createdAt: Date.now()}], onboardingCompleted: '1'}, null, 2))
  writeFileSync(marker, 'Isolated cloud acceptance profile\n', {mode: 0o600})
}
const env = {...process.env, MEDIA_CHIPS_DATA_DIR: dataDir, NODE_ENV: 'production'}
for (const args of [['scripts/compile.mjs', 'backend'], ['.backend-build/app/server.js']]) {
  const result = spawnSync(process.execPath, args, {cwd: root, env, stdio: 'inherit'})
  if (result.status !== 0) process.exit(result.status ?? 1)
}
