#!/usr/bin/env node
// PostToolUse (Edit|Write): run eslint on the file that was just changed.
// Exit code 2 feeds the lint errors back to the agent; warnings are ignored.
import {spawnSync} from 'node:child_process'
import {existsSync, readFileSync} from 'node:fs'
import {relative, resolve} from 'node:path'

let input = {}
try { input = JSON.parse(readFileSync(0, 'utf8')) } catch { process.exit(0) }

const root = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd())
const target = input?.tool_input?.file_path
if (!target) process.exit(0)

const abs = resolve(root, target)
const rel = relative(root, abs).split('\\').join('/')
if (rel.startsWith('..') || !existsSync(abs)) process.exit(0)
if (!/\.(ts|mts|mjs|cjs|vue)$/.test(rel)) process.exit(0)
if (/^(dist|release|coverage|node_modules|plugins)\//.test(rel) || /^\.[a-z-]+-build\//.test(rel)) process.exit(0)

const r = spawnSync('npx', ['eslint', '--quiet', rel], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32',
})
if (r.status === 0) process.exit(0)

const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(0, 30).join('\n')
console.error(`eslint errors in ${rel}:\n${out}`)
process.exit(2)
