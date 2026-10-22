import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { load } = createRequire(import.meta.url)('js-yaml')
const metadata = name => /^latest.*\.yml$/.test(name)
const assert = (condition, message) => { if (!condition) throw new Error(message) }

export function digest(file, algorithm = 'sha512', encoding = 'base64') {
  const hash = createHash(algorithm)
  const fd = openSync(file, 'r')
  try {
    const buffer = Buffer.alloc(1024 * 1024)
    let count
    while ((count = readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, count))
    return hash.digest(encoding)
  } finally { closeSync(fd) }
}

export function validateArtifacts(root, version) {
  const files = new Map()
  for (const platform of ['Windows', 'macOS', 'Linux']) {
    const dir = path.join(root, `release-${platform}`)
    assert(existsSync(dir), `Missing ${platform} build`)
    for (const name of readdirSync(dir)) {
      assert(!files.has(name), `Duplicate artifact: ${name}`)
      const file = path.join(dir, name)
      assert(statSync(file).isFile() && (/\.(exe|dmg|zip|AppImage|blockmap)$/.test(name) || metadata(name)), `Unexpected artifact: ${name}`)
      files.set(name, file)
    }
  }
  for (const name of ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']) {
    assert(files.has(name), `Missing update metadata: ${name}`)
  }
  const checkReference = (url, sha512, size) => {
    assert(typeof url === 'string', 'Missing update URL')
    const name = decodeURIComponent(url)
    assert(name === path.basename(name) && !/[\\/?#]/.test(name), `Non-local update URL: ${url}`)
    assert(files.has(name) && !metadata(name), `Missing update artifact: ${name}`)
    assert(sha512 === digest(files.get(name)), `SHA512 mismatch: ${name}`)
    if (size !== undefined) assert(size === statSync(files.get(name)).size, `Size mismatch: ${name}`)
  }
  for (const [name, file] of files) {
    if (!metadata(name)) continue
    const doc = load(readFileSync(file, 'utf8'))
    assert(doc.version === version, `Version mismatch: ${name}`)
    assert(Array.isArray(doc.files) && doc.files.length > 0, `Empty metadata: ${name}`)
    for (const entry of doc.files) checkReference(entry.url, entry.sha512, entry.size)
    if (doc.path !== undefined) checkReference(doc.path, doc.sha512)
  }
  return files
}

// Published releases are immutable here. Only drafts belonging to this exact commit
// may be replaced, including when a previous attempt left partial uploads.
export function publish({ tag, sha, files, gh, notes }) {
  assert(gh(['api', `repos/{owner}/{repo}/commits/${tag}`, '--jq', '.sha']).trim() === sha,
    'Remote tag no longer points to the checked commit')
  const releases = JSON.parse(gh(['api', '--paginate', '--slurp', 'repos/{owner}/{repo}/releases']))
    .flat()
  const release = releases.find(item => item.tag_name === tag)
  if (release) {
    assert(release.draft, 'Published release exists; refusing to replace public assets')
    assert(release.target_commitish === sha, 'Draft belongs to another/unknown commit; refusing replacement')
    // Remove stale metadata before touching any installers. Draft stays private.
    const assets = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/{owner}/{repo}/releases/${release.id}/assets`])).flat()
    assets.sort((a, b) => Number(metadata(b.name)) - Number(metadata(a.name)))
    for (const asset of assets) gh(['api', '--method', 'DELETE', `repos/{owner}/{repo}/releases/assets/${asset.id}`])
  } else {
    gh(['release', 'create', tag, '--verify-tag', '--draft', '--target', sha,
      '--title', `MediaChips ${tag}`, ...(notes ? ['--notes-file', notes] : ['--generate-notes'])])
  }
  const verify = selected => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mediachips-release-'))
    try {
      for (const [name, file] of selected) {
        gh(['release', 'download', tag, '--pattern', name, '--dir', dir])
        assert(digest(path.join(dir, name)) === digest(file), `Uploaded bytes mismatch: ${name}`)
      }
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }
  const installers = [...files].filter(([name]) => !metadata(name))
  const updates = [...files].filter(([name]) => metadata(name))
  for (const [, file] of installers) gh(['release', 'upload', tag, file])
  verify(installers)
  for (const [, file] of updates) gh(['release', 'upload', tag, file])
  verify(updates)
  // Recheck moved tags immediately before making the complete release visible.
  assert(gh(['api', `repos/{owner}/{repo}/commits/${tag}`, '--jq', '.sha']).trim() === sha, 'Tag moved during upload')
  gh(['release', 'edit', tag, '--draft=false', ...(notes ? ['--notes-file', notes] : [])])
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version
  const { GITHUB_REF_TYPE, GITHUB_REF_NAME: tag, GITHUB_SHA: sha } = process.env
  assert(GITHUB_REF_TYPE === 'tag' && tag === `v${version}` && sha, 'Release requires a tag matching package.json')
  const files = validateArtifacts('release-artifacts', version)
  const gh = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  const temp = mkdtempSync(path.join(tmpdir(), 'mediachips-notes-'))
  try {
    const notes = path.join(temp, 'notes.md')
    let notesFile
    try {
      execFileSync(process.execPath, ['scripts/extract-changelog.mjs', version, notes], { stdio: 'inherit' })
      notesFile = notes
    } catch { console.log('Using generated release notes') }
    publish({ tag, sha, files, gh, notes: notesFile })
  } finally { rmSync(temp, { recursive: true, force: true }) }
}
