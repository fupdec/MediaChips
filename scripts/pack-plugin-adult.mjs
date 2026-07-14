#!/usr/bin/env node
import {mkdirSync, readFileSync, rmSync} from 'fs'
import {spawnSync} from 'child_process'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = join(root, 'plugins/official/adult')
const outDir = join(root, 'plugins/dist')
const manifest = JSON.parse(readFileSync(join(packageDir, 'plugin.json'), 'utf8'))
const zipName = `${manifest.id}-${manifest.version}.zip`
const zipPath = join(outDir, zipName)

mkdirSync(outDir, {recursive: true})
rmSync(zipPath, {force: true})

const result = spawnSync(
  'zip',
  ['-r', zipPath, 'plugin.json', 'README.md'],
  {cwd: packageDir, stdio: 'inherit'},
)

if (result.status !== 0) {
  console.error('Failed to build adult plugin zip (is `zip` installed?)')
  process.exit(result.status ?? 1)
}

console.log(`[plugins] wrote ${zipPath}`)
