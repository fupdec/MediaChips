export type ChangelogEntry = {
  id: string
  version: string
  date: string
  markdown: string
}

export function parseChangelogSections(markdown: string): ChangelogEntry[] {
  const lines = markdown.split(/\r?\n/)
  const entries: ChangelogEntry[] = []
  let current: ChangelogEntry | null = null

  for (const line of lines) {
    const heading = line.match(/^## \[(.+?)\](?: - (.+))?$/)

    if (heading) {
      if (current) {
        entries.push(current)
      }

      const id = heading[1]
      current = {
        id,
        version: id.startsWith('v') ? id : `v${id}`,
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

export function normalizeVersion(version: string): string {
  return String(version || '').replace(/^v/i, '')
}

export function parseVersionParts(version: string): number[] {
  const core = normalizeVersion(version).split('-')[0]
  return core.split('.').map((part) => Number.parseInt(part, 10) || 0)
}

export function compareSemver(left: string, right: string): number {
  const leftParts = parseVersionParts(left)
  const rightParts = parseVersionParts(right)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (diff !== 0) {
      return diff
    }
  }

  return 0
}

export function getEntriesBetween(
  entries: ChangelogEntry[],
  fromVersion: string,
  toVersion: string,
): ChangelogEntry[] {
  return entries.filter((entry) => (
    compareSemver(entry.id, fromVersion) > 0
    && compareSemver(entry.id, toVersion) <= 0
  ))
}
