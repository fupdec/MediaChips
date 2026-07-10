import { describe, expect, it } from 'vitest'
import { parseChangelogSections, compareSemver, getEntriesBetween } from '@/utils/changelogParser'
import { markdownChangelogToHtml } from '@/utils/changelogMarkdown'

const sample = `# Changelog

## [Unreleased]

### Added
- **Feature** — details

## [1.0.10] - 2026-07-10

### Added
- **Performer scraper** — automated updates

### Fixed
- **Tag deletion** — refresh list

## [1.0.9] - 2026-07-10

### Added
- **Carousel** — image carousel
`

describe('changelogParser', () => {
  it('parses keep-a-changelog sections and skips Unreleased', () => {
    const entries = parseChangelogSections(sample)

    expect(entries.map((entry) => entry.id)).toEqual(['1.0.10', '1.0.9'])
    expect(entries[0].date).toBe('2026-07-10')
    expect(entries[0].markdown).toContain('Performer scraper')
  })

  it('compares semver versions', () => {
    expect(compareSemver('1.0.10', '1.0.9')).toBeGreaterThan(0)
    expect(compareSemver('1.0.9', '1.0.10')).toBeLessThan(0)
  })

  it('returns entries between versions', () => {
    const entries = parseChangelogSections(sample)
    const between = getEntriesBetween(entries, '1.0.9', '1.0.10')

    expect(between.map((entry) => entry.id)).toEqual(['1.0.10'])
  })
})

describe('markdownChangelogToHtml', () => {
  it('converts headings, lists, and inline formatting', () => {
    const html = markdownChangelogToHtml(`### Added\n\n- **Feature** — details`)

    expect(html).toContain('<h3>Added</h3>')
    expect(html).toContain('<strong>Feature</strong>')
    expect(html).toContain('<li>')
  })
})
