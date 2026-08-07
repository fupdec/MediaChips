import {describe, expect, it} from 'vitest'
import {
  buildContentSnippet,
  getTextIndexExtension,
  isTextIndexablePath,
  stripHtmlToText,
} from './textContentIndex'

describe('textContentIndex', () => {
  it('recognizes indexable extensions', () => {
    expect(isTextIndexablePath('/a/notes.md')).toBe(true)
    expect(isTextIndexablePath('/a/page.HTML')).toBe(true)
    expect(isTextIndexablePath('/a/doc.pdf')).toBe(false)
    expect(getTextIndexExtension('/a/foo.TXT')).toBe('txt')
  })

  it('strips html to searchable text', () => {
    expect(stripHtmlToText('<p>Hello <b>world</b></p><script>x()</script>')).toBe('Hello world')
  })

  it('builds a snippet around the match', () => {
    const snippet = buildContentSnippet('alpha beta gamma delta epsilon', 'gamma', 5)
    expect(snippet).toContain('gamma')
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
  })
})
