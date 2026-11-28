import {describe, expect, it} from 'vitest'
import {sanitizeInlineHtml} from './sanitizeHtml'

describe('sanitizeInlineHtml', () => {
  it('keeps plain text and allowed inline tags', () => {
    expect(sanitizeInlineHtml('Plain & <b>bold</b><br/>x')).toBe('Plain & <b>bold</b><br>x')
    expect(sanitizeInlineHtml('<mark class="global-search__hl">a</mark>')).toBe('<mark class="global-search__hl">a</mark>')
  })

  it('escapes script, event handlers and unknown tags', () => {
    expect(sanitizeInlineHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;')
    expect(sanitizeInlineHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(sanitizeInlineHtml('<b onclick="x()">t</b>')).toBe('&lt;b onclick="x()"&gt;t</b>')
    expect(sanitizeInlineHtml('<mark class="evil" onmouseover="x">')).toBe('&lt;mark class="evil" onmouseover="x"&gt;')
  })

  it('escapes stray angle brackets and tolerates nullish input', () => {
    expect(sanitizeInlineHtml('a < b > c')).toBe('a &lt; b &gt; c')
    expect(sanitizeInlineHtml(undefined)).toBe('')
  })
})
