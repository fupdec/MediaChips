import {describe, expect, it} from 'vitest'
import {
  formatDocsForPrompt,
  normalizeDocLocale,
  searchDocs,
  searchDocsForAssistant,
} from './docRetrieval'

describe('docRetrieval', () => {
  it('re-exports shared search for english queries', () => {
    const chunks = searchDocs('add media', 'en', 3)
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.some((chunk) => chunk.id.includes('media'))).toBe(true)
    expect(formatDocsForPrompt(chunks)).toContain('id=')
  })

  it('falls back when locale is missing content', () => {
    const chunks = searchDocs('filters', 'xx', 2)
    expect(chunks.length).toBeGreaterThan(0)
  })

  it('normalizes and merges assistant docs by UI locale', () => {
    expect(normalizeDocLocale('zh-CN')).toBe('cn')
    const chunks = searchDocsForAssistant('add media', 'de', 3)
    expect(chunks.length).toBeGreaterThan(0)
  })
})
