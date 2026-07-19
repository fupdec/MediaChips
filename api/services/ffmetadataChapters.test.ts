import { describe, expect, it } from 'vitest'
import { buildFfmetadataChapters } from './ffmetadataChapters'

describe('buildFfmetadataChapters', () => {
  it('builds ffmetadata chapters with escaped titles', () => {
    const body = buildFfmetadataChapters([
      {title: 'Part #1; yes', time: 1.5},
      {title: 'Favorite', time: 10},
    ])

    expect(body).toContain(';FFMETADATA1')
    expect(body).toContain('START=1500')
    expect(body).toContain('END=10000')
    expect(body).toContain('START=10000')
    expect(body).toContain('title=Part \\#1\\; yes')
    expect(body).toContain('title=Favorite')
  })

  it('returns header only for empty input', () => {
    expect(buildFfmetadataChapters([])).toBe(';FFMETADATA1\n')
  })
})
