import changelogMarkdown from '../../CHANGELOG.md?raw'
import {
  compareSemver,
  getEntriesBetween,
  normalizeVersion,
  parseChangelogSections,
  type ChangelogEntry,
} from '@/utils/changelogParser'
import { markdownChangelogToHtml } from '@/utils/changelogMarkdown'
import legacyHistory from '@/assets/Version_Histrory'

export type VersionHistoryEntry = {
  id: string
  version: string
  name: string
  date?: string
  content: string
}

const bundledEntries = parseChangelogSections(changelogMarkdown)

function toHistoryEntry(entry: ChangelogEntry): VersionHistoryEntry {
  const titleLine = entry.markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('- **') || line.startsWith('**'))

  const name = titleLine
    ? titleLine
      .replace(/^[-*]\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/ — .+$/, '')
      .trim()
    : ''

  return {
    id: normalizeVersion(entry.id),
    version: entry.version,
    name,
    date: entry.date,
    content: markdownChangelogToHtml(entry.markdown),
  }
}

export function getBundledChangelogEntries(): ChangelogEntry[] {
  return bundledEntries
}

export function getChangelogEntry(version: string): VersionHistoryEntry | null {
  const normalized = normalizeVersion(version)
  const entry = bundledEntries.find((item) => normalizeVersion(item.id) === normalized)

  if (!entry) {
    return null
  }

  return toHistoryEntry(entry)
}

export function getChangelogHtml(version: string, fallbackMarkdown = ''): string {
  const entry = getChangelogEntry(version)

  if (entry) {
    return entry.content
  }

  if (fallbackMarkdown.trim()) {
    return markdownChangelogToHtml(fallbackMarkdown)
  }

  return ''
}

export function getChangelogEntriesSince(
  fromVersion: string,
  toVersion: string,
): VersionHistoryEntry[] {
  return getEntriesBetween(bundledEntries, fromVersion, toVersion)
    .map((entry) => toHistoryEntry(entry))
}

export function getMergedVersionHistory(): VersionHistoryEntry[] {
  const generated = bundledEntries.map((entry) => toHistoryEntry(entry))
  const generatedIds = new Set(generated.map((entry) => entry.id))
  const legacy = (legacyHistory as VersionHistoryEntry[])
    .filter((entry) => !generatedIds.has(normalizeVersion(entry.id)))

  return [...generated, ...legacy]
}

export function isVersionNewerThan(version: string, baseline: string): boolean {
  if (!baseline) {
    return false
  }

  return compareSemver(version, baseline) > 0
}
