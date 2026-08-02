import {describe, expect, it} from 'vitest'
import {formatDocsForPrompt, searchDocs} from './docRetrieval'

describe('docRetrieval', () => {
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
