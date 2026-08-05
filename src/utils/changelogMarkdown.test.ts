import {describe, expect, it} from 'vitest'
import {
  changelogNotesToHtml,
  changelogNotesToPlainPreview,
  looksLikeHtmlChangelog,
  markdownChangelogToHtml,
} from './changelogMarkdown'

describe('looksLikeHtmlChangelog', () => {
  it('detects html tags', () => {
    expect(looksLikeHtmlChangelog('<p>hi</p>')).toBe(true)
    expect(looksLikeHtmlChangelog('## Added')).toBe(false)
  })
})

describe('markdownChangelogToHtml', () => {
  it('renders headings, lists, and inline markdown', () => {
    const html = markdownChangelogToHtml([
      '## Added',
      '- **Bold** and `code`',
      '',
      'See [docs](https://example.com)',
    ].join('\n'))

    expect(html).toContain('<h2>Added</h2>')
    expect(html).toContain('<ul><li><strong>Bold</strong> and <code>code</code></li></ul>')
    expect(html).toContain('href="https://example.com"')
  })
})

describe('changelogNotesToHtml', () => {
  it('passthroughs html and converts markdown', () => {
    expect(changelogNotesToHtml('<p>x</p>')).toBe('<p>x</p>')
    expect(changelogNotesToHtml('## Fixed')).toContain('<h2>Fixed</h2>')
    expect(changelogNotesToHtml('  ')).toBe('')
  })
})

describe('changelogNotesToPlainPreview', () => {
  it('returns first meaningful plain line', () => {
    expect(changelogNotesToPlainPreview('<p>Hello — world</p>')).toBe('Hello')
    expect(changelogNotesToPlainPreview('## Added\n- First item')).toBe('First item')
    expect(changelogNotesToPlainPreview('')).toBe('')
  })
})
