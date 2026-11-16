import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { digest, publish, validateArtifacts } from './publish-release.mjs'
const { load, dump } = createRequire(import.meta.url)('js-yaml')

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'release-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [platform, meta, ext] of [['Windows', 'latest.yml', 'exe'], ['macOS', 'latest-mac.yml', 'zip'], ['Linux', 'latest-linux.yml', 'AppImage']]) {
    const dir = path.join(root, `release-${platform}`)
    mkdirSync(dir)
    const name = `app-${platform}.${ext}`
    const file = path.join(dir, name)
    writeFileSync(file, platform)
    writeFileSync(path.join(dir, meta), dump({ version: '1.2.3', files: [{ url: name, sha512: digest(file), size: platform.length }], path: name, sha512: digest(file) }))
  }
  return root
}

test('release requires reusable CI and all platform builds, with scoped downloads and serialization', () => {
  const release = load(readFileSync('.github/workflows/release.yml', 'utf8'))
  const ci = load(readFileSync('.github/workflows/ci.yml', 'utf8'))
  assert.ok('workflow_call' in ci.on)
  assert.deepEqual(Object.keys(ci.jobs).sort(), ['e2e', 'lint', 'pack', 'typecheck', 'unit-tests'])
  assert.equal(release.jobs.checks.uses, './.github/workflows/ci.yml')
  assert.equal(release.jobs.build.needs, 'checks')
  assert.deepEqual(release.jobs.publish.needs, ['checks', 'build'])
  assert.equal(release.concurrency['cancel-in-progress'], false)
  assert.equal(release.concurrency.group, 'release-${{ github.ref }}')
  assert.equal(release.permissions.contents, 'read')
  assert.equal(release.jobs.publish.permissions.contents, 'write')
  const download = release.jobs.publish.steps.find(step => step.uses?.startsWith('actions/download-artifact'))
  assert.equal(download.with.pattern, 'release-*')
  assert.equal(download.with['merge-multiple'], false)
})

test('validates versions, hashes, missing files and colliding platform assets before publication', t => {
  const root = fixture(t)
  assert.equal(validateArtifacts(root, '1.2.3').size, 6)
  assert.throws(() => validateArtifacts(root, '9.0.0'), /Version mismatch/)
  const file = path.join(root, 'release-Windows/app-Windows.exe')
  writeFileSync(file, 'corrupt')
  assert.throws(() => validateArtifacts(root, '1.2.3'), /SHA512 mismatch/)
  rmSync(file)
  assert.throws(() => validateArtifacts(root, '1.2.3'), /Missing update artifact/)
  writeFileSync(path.join(root, 'release-Windows/app-Linux.AppImage'), 'duplicate')
  assert.throws(() => validateArtifacts(root, '1.2.3'), /Duplicate artifact/)
})

function fakeGh(files, release, failUpload) {
  const calls = []
  const gh = args => {
    calls.push(args)
    if (args.includes('--jq')) return 'commit'
    if (args[0] === 'api' && args.at(-1).endsWith('/releases')) return JSON.stringify([release ? [release] : []])
    if (args[0] === 'api' && args.at(-1).endsWith('/assets')) return JSON.stringify([[{ id: 1, name: 'old.exe' }, { id: 2, name: 'latest.yml' }]])
    if (args[1] === 'upload' && failUpload) throw new Error('network failure')
    if (args[1] === 'download') {
      const name = args[args.indexOf('--pattern') + 1]
      copyFileSync(files.get(name), path.join(args.at(-1), name))
    }
    return ''
  }
  return { gh, calls }
}

test('draft created first; installers uploaded and verified before metadata; publish last', t => {
  const files = validateArtifacts(fixture(t), '1.2.3')
  const { gh, calls } = fakeGh(files)
  publish({ tag: 'v1.2.3', sha: 'commit', files, gh })
  assert.ok(calls.find(args => args[1] === 'create').includes('--draft'))
  const uploads = calls.filter(args => args[1] === 'upload')
  assert.ok(uploads.slice(0, 3).every(args => !args.at(-1).endsWith('.yml')))
  assert.ok(uploads.slice(3).every(args => args.at(-1).endsWith('.yml')))
  assert.ok(calls.findIndex(args => args[1] === 'download') < calls.findIndex(args => args[1] === 'upload' && args.at(-1).endsWith('.yml')))
  assert.ok(calls.at(-1).includes('--draft=false'))
})

test('public or foreign draft rejected without mutations; failed upload stays draft; retry cleans metadata first', t => {
  const files = validateArtifacts(fixture(t), '1.2.3')
  for (const release of [{ draft: false }, { draft: true, target_commitish: 'other' }]) {
    const { gh, calls } = fakeGh(files, { tag_name: 'v1.2.3', ...release })
    assert.throws(() => publish({ tag: 'v1.2.3', sha: 'commit', files, gh }), /refusing/)
    assert.ok(calls.every(args => args[0] === 'api' && !args.includes('DELETE')))
  }
  const { gh, calls } = fakeGh(files, { id: 7, tag_name: 'v1.2.3', draft: true, target_commitish: 'commit' }, true)
  assert.throws(() => publish({ tag: 'v1.2.3', sha: 'commit', files, gh }), /network failure/)
  assert.ok(calls.find(args => args.includes('DELETE')).at(-1).endsWith('/2'))
  assert.ok(!calls.some(args => args.includes('--draft=false')))
})

test('metadata upload failure and mismatched remote bytes never publish', t => {
  const files = validateArtifacts(fixture(t), '1.2.3')
  for (const failure of ['metadata', 'bytes', 'tag']) {
    const fake = fakeGh(files)
    let tagReads = 0
    const gh = args => {
      if (failure === 'metadata' && args[1] === 'upload' && args.at(-1).endsWith('.yml')) throw new Error('metadata failed')
      if (failure === 'tag' && args.includes('--jq') && ++tagReads === 2) return 'moved'
      const result = fake.gh(args)
      if (failure === 'bytes' && args[1] === 'download') writeFileSync(path.join(args.at(-1), args[args.indexOf('--pattern') + 1]), 'wrong bytes')
      return result
    }
    assert.throws(() => publish({ tag: 'v1.2.3', sha: 'commit', files, gh }))
    assert.ok(!fake.calls.some(args => args.includes('--draft=false')))
  }
})
