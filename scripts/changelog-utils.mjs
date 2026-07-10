import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export function parseChangelogSections(markdown) {
  const lines = markdown.split(/\r?\n/)
  const entries = []
  let current = null

  for (const line of lines) {
    const heading = line.match(/^## \[(.+?)\](?: - (.+))?$/)

    if (heading) {
      if (current) {
        entries.push(current)
      }

      current = {
        id: heading[1],
        version: heading[1].startsWith('v') ? heading[1] : `v${heading[1]}`,
        date: heading[2] || '',
        markdown: '',
      }
      continue
    }

    if (current) {
      current.markdown += `${line}\n`
    }
  }

  if (current) {
    entries.push(current)
  }

  return entries
    .map((entry) => ({
      ...entry,
      markdown: entry.markdown.trim(),
    }))
    .filter((entry) => entry.id !== 'Unreleased' && entry.markdown.length > 0)
}

export function readChangelogEntries(changelogPath = join(root, 'CHANGELOG.md')) {
  const markdown = readFileSync(changelogPath, 'utf8')
  return parseChangelogSections(markdown)
}

export function extractChangelogSection(version, changelogPath = join(root, 'CHANGELOG.md')) {
  const normalized = String(version || '').replace(/^v/, '')
  const entries = readChangelogEntries(changelogPath)
  const entry = entries.find((item) => item.id.replace(/^v/, '') === normalized)

  if (!entry) {
    return null
  }

  return entry.markdown
}
