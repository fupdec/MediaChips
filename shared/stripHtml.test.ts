import {describe, expect, it} from 'vitest'
import {stripHtmlTags} from './stripHtml'

describe('stripHtmlTags', () => {
  it('removes tags and collapses whitespace', () => {
    expect(stripHtmlTags('<b>Hi</b> there')).toBe('Hi there')
    expect(stripHtmlTags('  a   b  ')).toBe('a b')
    expect(stripHtmlTags('')).toBe('')
  })
})
