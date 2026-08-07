import {describe, expect, it} from 'vitest'
import {
  extensionBadgeLabel,
  getFileExtension,
  isHtmlTextPreviewExtension,
  isInAppTextPreviewPath,
  looksLikeBinaryText,
} from './textPreview'

describe('textPreview', () => {
  it('reads extensions from paths', () => {
    expect(getFileExtension('/a/b/note.TXT')).toBe('txt')
    expect(getFileExtension('C:\\docs\\page.html')).toBe('html')
    expect(getFileExtension('noext')).toBe('')
  })

  it('gates in-app previewable paths', () => {
    expect(isInAppTextPreviewPath('/x/readme.md')).toBe(true)
    expect(isInAppTextPreviewPath('/x/page.htm')).toBe(true)
    expect(isInAppTextPreviewPath('/x/book.pdf')).toBe(false)
    expect(isInAppTextPreviewPath('/x/doc.docx')).toBe(false)
  })

  it('detects html preview mode and badge labels', () => {
    expect(isHtmlTextPreviewExtension('HTML')).toBe(true)
    expect(isHtmlTextPreviewExtension('md')).toBe(false)
    expect(extensionBadgeLabel('/a/b/file.pdf')).toBe('PDF')
    expect(extensionBadgeLabel('/a/b/noext')).toBe('FILE')
  })

  it('flags binary-ish samples', () => {
    expect(looksLikeBinaryText('hello\nworld')).toBe(false)
    expect(looksLikeBinaryText(`ok\u0000nope`)).toBe(true)
  })
})
