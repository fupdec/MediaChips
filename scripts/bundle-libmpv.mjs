#!/usr/bin/env node
/**
 * Bundles libmpv and everything it links against so the macOS app needs no Homebrew.
 *
 *   node scripts/bundle-libmpv.mjs [--arch arm64|x64] [--lib /path/to/libmpv.2.dylib] [--optional]
 *
 * Output: .mpv-build/<arch>/  (libmpv.2.dylib, its dependencies, mpvview.node)
 * electron-builder copies that folder to Resources/mpv (see build.mac.extraResources).
 *
 * Every library is copied, its install names are rewritten to @loader_path, and it is re-signed
 * ad-hoc: changing install names invalidates the signature, and arm64 refuses to load (SIGKILL)
 * an unsigned or badly signed library. libmpv is GPL; the app is GPL-3.0 and ships its source.
 */
import {execFileSync} from 'child_process'
import {chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync} from 'fs'
import {arch as hostArch} from 'os'
import {basename, dirname, join} from 'path'
import {fileURLToPath} from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : (args[index + 1] ?? fallback)
}
const optional = args.includes('--optional')
const arch = option('--arch', hostArch() === 'arm64' ? 'arm64' : 'x64')
const outDir = join(root, '.mpv-build', arch)
const addonPath = join(root, 'native', 'mpv-view', 'build', 'Release', 'mpvview.node')

const homebrewPrefix = arch === 'arm64' ? '/opt/homebrew' : '/usr/local'
const libCandidates = [
  option('--lib', ''),
  process.env[arch === 'arm64' ? 'MPV_LIB' : 'MPV_LIB_X64'] || '',
  join(homebrewPrefix, 'lib', 'libmpv.2.dylib'),
].filter(Boolean)

function skip(message) {
  console.warn(`[mpv-bundle] ${message}`)
  rmSync(outDir, {recursive: true, force: true})
  mkdirSync(outDir, {recursive: true})
  writeFileSync(join(outDir, 'README.txt'), `Native mpv player not bundled: ${message}\n`)
  process.exit(optional ? 0 : 1)
}

if (process.platform !== 'darwin') skip('macOS only')
const libmpv = libCandidates.find(candidate => existsSync(candidate))
if (!libmpv) skip(`libmpv for ${arch} not found (tried ${libCandidates.join(', ')}); install it with Homebrew`)
if (!existsSync(addonPath)) skip('mpvview.node is not built (npm run spike:mpv-native:build)')
if (!execFileSync('lipo', ['-archs', addonPath], {encoding: 'utf8'}).split(/\s+/).includes(arch === 'arm64' ? 'arm64' : 'x86_64')) {
  skip(`mpvview.node has no ${arch} slice (it was built on another architecture)`)
}

const otool = (file) => execFileSync('otool', ['-L', file], {encoding: 'utf8'})
  .split('\n').slice(1).map(line => /^\s+(\S+)/.exec(line)?.[1]).filter(Boolean)
const isSystem = ref => ref.startsWith('/usr/lib/') || ref.startsWith('/System/')

function archsOf(file) {
  return execFileSync('lipo', ['-archs', file], {encoding: 'utf8'}).trim().split(/\s+/)
}

function resolveRef(ref, parent) {
  if (/^@(rpath|loader_path|executable_path)\//.test(ref)) {
    const name = ref.split('/').slice(1).join('/')
    for (const base of [dirname(parent), join(homebrewPrefix, 'lib')]) {
      const candidate = join(base, name)
      if (existsSync(candidate)) return realpathSync(candidate)
    }
    return null
  }
  return existsSync(ref) ? realpathSync(ref) : null
}

// 1. Collect the closure: real path -> set of file names other libraries refer to it by.
const names = new Map()
const refsOf = new Map()
const queue = [realpathSync(libmpv)]
names.set(queue[0], new Set(['libmpv.2.dylib']))
while (queue.length) {
  const file = queue.pop()
  if (refsOf.has(file)) continue
  const edges = []
  for (const ref of otool(file)) {
    if (isSystem(ref)) continue
    const target = resolveRef(ref, file)
    if (!target) {
      console.error(`[mpv-bundle] cannot resolve ${ref} (from ${file})`)
      process.exit(1)
    }
    if (target === file) continue
    edges.push({ref, target})
    if (!names.has(target)) names.set(target, new Set())
    names.get(target).add(basename(ref))
    queue.push(target)
  }
  refsOf.set(file, edges)
}

const wrongArch = [...names.keys()].filter(file => !archsOf(file).includes(arch === 'arm64' ? 'arm64' : 'x86_64'))
if (wrongArch.length) {
  console.error(`[mpv-bundle] these libraries have no ${arch} slice:\n  ${wrongArch.join('\n  ')}`)
  process.exit(1)
}

// 2. Copy under every name that is referenced, then rewrite install names.
rmSync(outDir, {recursive: true, force: true})
mkdirSync(outDir, {recursive: true})
const copies = []
for (const [file, fileNames] of names) {
  for (const name of fileNames) {
    const target = join(outDir, name)
    copyFileSync(file, target)
    chmodSync(target, 0o755)
    copies.push({source: file, target, name})
  }
}
for (const copy of copies) {
  const changes = []
  for (const {ref, target} of refsOf.get(copy.source) ?? []) {
    changes.push('-change', ref, `@loader_path/${basename(ref)}`)
    if (!names.get(target)?.has(basename(ref))) {
      console.error(`[mpv-bundle] missing copy for ${ref}`)
      process.exit(1)
    }
  }
  execFileSync('install_name_tool', ['-id', `@loader_path/${copy.name}`, ...changes, copy.target], {stdio: 'pipe'})
}

// 3. The addon only talks to libmpv through dlopen, so it needs no relinking.
copyFileSync(addonPath, join(outDir, 'mpvview.node'))

// 4. Ad-hoc sign everything (install_name_tool invalidated the original signatures).
const files = readdirSync(outDir).filter(name => name.endsWith('.dylib') || name.endsWith('.node'))
for (const name of files) {
  execFileSync('codesign', ['--force', '--sign', '-', join(outDir, name)], {stdio: 'pipe'})
}

// 5. Verify: nothing may still point into Homebrew, and every signature must be valid.
const problems = []
for (const name of files) {
  const file = join(outDir, name)
  for (const ref of otool(file)) {
    if (ref.startsWith(homebrewPrefix) || ref.startsWith('/opt/homebrew') || ref.startsWith('/usr/local/')) {
      problems.push(`${name} still links ${ref}`)
    }
  }
  try {
    execFileSync('codesign', ['--verify', '--strict', file], {stdio: 'pipe'})
  } catch {
    problems.push(`${name} has an invalid signature`)
  }
}
if (problems.length) {
  console.error(`[mpv-bundle] verification failed:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}

const bytes = files.reduce((sum, name) => sum + statSync(join(outDir, name)).size, 0)
console.log(`[mpv-bundle] ${arch}: ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB -> ${outDir}`)
