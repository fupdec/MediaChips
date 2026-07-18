#!/usr/bin/env node
import {mkdirSync, readFileSync, rmSync, existsSync} from 'fs'
import {spawnSync} from 'child_process'
import {dirname, join} from 'path'
import {createRequire} from 'module'
import {fileURLToPath} from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = join(root, 'plugins/official/tmdb')
const outDir = join(root, 'plugins/dist')
const mainEntrySource = join(root, 'packages/plugin-tmdb/src/server/registerPluginMain.ts')
const mainOut = join(packageDir, 'main.cjs')
const require = createRequire(import.meta.url)
const manifest = JSON.parse(readFileSync(join(packageDir, 'plugin.json'), 'utf8'))
const zipPath = join(outDir, `${manifest.id}-${manifest.version}.zip`)

mkdirSync(outDir, {recursive: true})
rmSync(zipPath, {force: true})
rmSync(mainOut, {force: true})

let esbuildBin
try {
  esbuildBin = require.resolve('esbuild/bin/esbuild')
} catch {
  console.error('esbuild not found (expected via vite). Run npm install.')
  process.exit(1)
}

const build = spawnSync(esbuildBin, [
  mainEntrySource, '--bundle', '--platform=node', '--format=cjs', `--outfile=${mainOut}`,
  '--packages=bundle', '--external:better-sqlite3', '--external:electron', '--log-level=warning',
], {cwd: root, stdio: 'inherit'})

if (build.status !== 0 || !existsSync(mainOut)) {
  console.error('Failed to bundle tmdb plugin main.cjs')
  process.exit(build.status ?? 1)
}

const result = spawnSync('zip', ['-r', zipPath, 'plugin.json', 'README.md', 'main.cjs'], {
  cwd: packageDir,
  stdio: 'inherit',
})
if (result.status !== 0) {
  console.error('Failed to build tmdb plugin zip (is `zip` installed?)')
  process.exit(result.status ?? 1)
}
console.log(`[plugins] wrote ${zipPath}`)
