#!/usr/bin/env node
// PreToolUse (Edit|Write): refuse edits to build output and generated files.
// Exit code 2 sends stderr back to the agent as the reason.
import {existsSync, readFileSync} from 'node:fs'
import {relative, resolve} from 'node:path'

let input = {}
try { input = JSON.parse(readFileSync(0, 'utf8')) } catch { process.exit(0) }

const root = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd())
const target = input?.tool_input?.file_path
if (!target) process.exit(0)

const abs = resolve(root, target)
const rel = relative(root, abs).split('\\').join('/')
if (rel.startsWith('..')) process.exit(0)

const deny = (why) => {
  console.error(`Blocked edit of ${rel}: ${why}`)
  process.exit(2)
}

const generated = [
  [/^shared\/(sfwCompiled|msStoreCompiled)\.ts$/, 'overwritten by scripts/compile.mjs; change the build flags/script instead'],
  [/^plugins\/official\/adult\/main\.cjs$/, 'rebuilt by `npm run pack:plugin-adult`; edit packages/plugin-adult/src'],
  [/^(dist|release|coverage|\.[a-z-]+-build|\.cache)\//, 'build output; edit the sources'],
]
for (const [re, why] of generated) if (re.test(rel)) deny(why)

// Compiled twin of a TypeScript source (gitignored): foo.js next to foo.ts
if (/\.js$/.test(rel) && existsSync(abs.replace(/\.js$/, '.ts'))) {
  deny(`this is gitignored compiled output; edit ${rel.replace(/\.js$/, '.ts')} instead`)
}
process.exit(0)
