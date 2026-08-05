import {describe, expect, it} from 'vitest'
import {
  formatDocsForPrompt,
  scoreDocChunk,
  searchDocs,
  stripDocHtml,
  tokenizeDocText,
} from './docRetrieval'

describe('shared/docRetrieval', () => {
  it('strips html and tokenizes text', () => {
    expect(stripDocHtml('<p>Hello&nbsp;<b>world</b></p>')).toBe('Hello world')
    expect(tokenizeDocText('Add Media-Items now')).toEqual(['add', 'media-items', 'now'])
  })

  it('scores title hits higher than body-only matches', () => {
    const bodyOnly = scoreDocChunk(['filters'], {
      id: 'x',
      title: 'Other',
      text: 'filters live here',
      score: 0,
    })
    const titleHit = scoreDocChunk(['filters'], {
      id: 'y',
      title: 'Filters',
      text: 'overview',
      score: 0,
    })
    expect(titleHit).toBeGreaterThan(bodyOnly)
  })

  it('finds documentation chunks for english queries', () => {
    const chunks = searchDocs('add media', 'en', 3)
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.some((chunk) => chunk.id.includes('media'))).toBe(true)
    expect(formatDocsForPrompt(chunks)).toContain('id=')
  })

  it('falls back when locale is missing content', () => {
    const chunks = searchDocs('filters', 'xx', 2)
    expect(chunks.length).toBeGreaterThan(0)
  })
})
