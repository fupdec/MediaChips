#!/usr/bin/env node
/**
 * One-shot verification for the files you changed (what CI would check, but only the relevant parts).
 *
 *   npm run check              changed + untracked files vs HEAD
 *   npm run check -- --all     every type-check (same as CI), eslint on the whole repo, no vitest
 *   npm run check -- --base main   files changed since `main`
 *   npm run check -- --no-test     skip vitest
 *   npm run check -- --no-lint     skip eslint
 *
 * Type-checks run in parallel; only failing output is printed (trimmed).
 */
import {spawn, spawnSync} from 'node:child_process'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const all = flag('--all')
const baseIdx = args.indexOf('--base')
const base = baseIdx >= 0 ? args[baseIdx + 1] : 'HEAD'

const env = {...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=8192'}

const TYPECHECKS = {
  ui: ['npx', 'vue-tsc', '--noEmit'],
  shared: ['npx', 'tsc', '-p', 'tsconfig.shared.json'],
  node: ['npx', 'tsc', '-p', 'tsconfig.node.json', '--noEmit'],
  electron: ['npx', 'tsc', '-p', 'tsconfig.electron-strict.json'],
  main: ['npx', 'tsc', '-p', 'tsconfig.main-strict.json'],
  app: ['npx', 'tsc', '-p', 'tsconfig.app-strict.json'],
  api: ['npx', 'tsc', '-p', 'tsconfig.api-strict.json'],
  scripts: ['npx', 'tsc', '-p', 'tsconfig.scripts-strict.json'],
}

function git(...gitArgs) {
  const r = spawnSync('git', gitArgs, {cwd: root, encoding: 'utf8'})
  if (r.status !== 0) {
    console.error(`git ${gitArgs.join(' ')} failed:\n${r.stderr}`)
    process.exit(2)
  }
  return r.stdout.split('\n').map((s) => s.trim()).filter(Boolean)
}

function changedFiles() {
  const tracked = git('diff', '--name-only', '--diff-filter=d', base)
  const untracked = base === 'HEAD' ? git('ls-files', '--others', '--exclude-standard') : []
  return [...new Set([...tracked, ...untracked])]
}

/** Which type-check groups a changed path can break. */
function groupsFor(file) {
  const groups = new Set()
  if (/^(package(-lock)?\.json|tsconfig[^/]*\.json)$/.test(file)) return Object.keys(TYPECHECKS)
  if (file.startsWith('src/') || file.startsWith('packages/') || file.startsWith('types/')) groups.add('ui')
  if (file.startsWith('packages/') && /\/src\/server\//.test(file)) groups.add('api')
  if (file.startsWith('shared/')) ['ui', 'shared', 'api', 'app', 'electron'].forEach((g) => groups.add(g))
  if (file.startsWith('api/')) groups.add('api')
  if (file.startsWith('app/')) { groups.add('app'); groups.add('api') }
  if (file.startsWith('electron/')) groups.add('electron')
  if (file === 'main.ts') groups.add('main')
  if (/^scripts\/.*\.ts$/.test(file)) groups.add('scripts')
  if (/^(vite\.config\.mts|drizzle\.config\.ts)$/.test(file)) groups.add('node')
  if (file.startsWith('api/db/schema/') || file.startsWith('api/db/migrations-drizzle/')) groups.add('api')
  return groups
}

const run = (cmd, cmdArgs, {capture = true} = {}) =>
  new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(cmd, cmdArgs, {cwd: root, env, shell: process.platform === 'win32', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'})
    let out = ''
    child.stdout?.on('data', (d) => { out += d })
    child.stderr?.on('data', (d) => { out += d })
    child.on('close', (code) => resolve({code: code ?? 1, out, ms: Date.now() - started}))
  })

function report(label, result) {
  const sec = (result.ms / 1000).toFixed(1)
  if (result.code === 0) {
    console.log(`  ok   ${label} (${sec}s)`)
    return true
  }
  console.log(`  FAIL ${label} (${sec}s)`)
  const lines = result.out.trim().split('\n')
  const shown = lines.slice(0, 40).join('\n')
  console.log(shown.replace(/^/gm, '       '))
  if (lines.length > 40) console.log(`       … ${lines.length - 40} more lines`)
  return false
}

const files = all ? [] : changedFiles()
if (!all && files.length === 0) {
  console.log(`No changes vs ${base}. Nothing to check (use --all for a full run).`)
  process.exit(0)
}

const groups = all ? new Set(Object.keys(TYPECHECKS)) : new Set(files.flatMap((f) => [...groupsFor(f)]))
const lintable = files.filter((f) => /\.(ts|mts|mjs|cjs|js|vue)$/.test(f) && !/^(dist|release|coverage)\//.test(f))
// Compiled twins of .ts sources are gitignored and must not be linted or tested.
const lintTargets = lintable.filter((f) => !/^(api|app|shared)\/.*\.js$|^electron\/[^/]+\.js$|^main\.js$/.test(f))
const testable = lintTargets.filter((f) => /\.(ts|vue)$/.test(f) && !/^e2e\//.test(f))

console.log(all ? 'Full check' : `Checking ${files.length} changed file(s) vs ${base}`)
let ok = true

if (groups.size) {
  console.log(`Type-check: ${[...groups].join(', ')}`)
  const results = await Promise.all([...groups].map(async (g) => [g, await run(TYPECHECKS[g][0], TYPECHECKS[g].slice(1))]))
  for (const [g, r] of results) ok = report(`types:${g}`, r) && ok
}

if (!flag('--no-lint')) {
  const targets = all ? ['.'] : lintTargets
  if (targets.length) {
    console.log('Lint:')
    ok = report('eslint', await run('npx', ['eslint', ...targets])) && ok
  }
}

if (!flag('--no-test') && !all && testable.length) {
  console.log('Tests (vitest related):')
  ok = report('vitest', await run('npx', ['vitest', 'related', '--run', '--passWithNoTests', ...testable])) && ok
}

console.log(ok ? '\nAll checks passed.' : '\nSome checks FAILED.')
process.exit(ok ? 0 : 1)
