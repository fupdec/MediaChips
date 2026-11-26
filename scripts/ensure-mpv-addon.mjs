#!/usr/bin/env node
// Dev helper for `npm run electron`: rebuilds native/mpv-view (mpvview.node) when it is missing or
// older than its sources, so a pulled change to the addon is never run against a stale binary.
// Never fails the launch: without the addon (or libmpv) the app simply uses the regular player.
import {spawnSync} from 'node:child_process'
import {existsSync, readdirSync, statSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const addonDir = path.join(root, 'native', 'mpv-view')
const addonPath = path.join(addonDir, 'build', 'Release', 'mpvview.node')

function newestSourceMtime() {
  const files = [path.join(addonDir, 'binding.gyp')]
  for (const dir of ['src', 'include']) {
    const full = path.join(addonDir, dir)
    if (!existsSync(full)) continue
    for (const entry of readdirSync(full, {recursive: true, withFileTypes: true})) {
      if (entry.isFile()) files.push(path.join(entry.parentPath ?? entry.path, entry.name))
    }
  }
  return Math.max(...files.filter(existsSync).map(file => statSync(file).mtimeMs))
}

function main() {
  if (process.platform !== 'darwin' && process.platform !== 'win32') return
  if (!existsSync(path.join(addonDir, 'binding.gyp'))) return

  const stale = !existsSync(addonPath) || statSync(addonPath).mtimeMs < newestSourceMtime()
  if (stale) {
    console.log('[mpv-addon] mpvview.node is missing or older than its sources, rebuilding...')
    const result = spawnSync('node', [path.join('scripts', 'build-mpv-addon.mjs')], {cwd: root, stdio: 'inherit'})
    if (result.status !== 0) {
      console.warn(existsSync(addonPath)
        ? '[mpv-addon] build failed (is MediaChips still running and holding the file?); using the existing, outdated mpvview.node.'
        : '[mpv-addon] build failed; the native player (mpv) is unavailable in this session.')
      return
    }
  }

  if (process.platform === 'win32') {
    const libmpv = process.env.MPV_LIB || path.join(addonDir, 'lib', 'libmpv-2.dll')
    if (!existsSync(libmpv)) {
      console.warn(`[mpv-addon] libmpv not found (${libmpv}); the native player setting stays hidden.`)
      console.warn('[mpv-addon] Put libmpv-2.dll from an mpv-dev-x86_64 build there, or set MPV_LIB.')
    }
  }
}

main()
