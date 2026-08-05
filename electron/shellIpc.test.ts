/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {parseExternalUrl} from './shellIpc'

describe('parseExternalUrl', () => {
  it('accepts http(s) and mailto', () => {
    expect(parseExternalUrl('https://example.com/a')).toEqual({
      ok: true,
      url: 'https://example.com/a',
    })
    expect(parseExternalUrl('mailto:hi@example.com').ok).toBe(true)
  })

  it('rejects empty, invalid, and unsupported protocols', () => {
    expect(parseExternalUrl('')).toEqual({ok: false, error: 'URL is required'})
    expect(parseExternalUrl('not a url')).toEqual({ok: false, error: 'Invalid URL'})
    expect(parseExternalUrl('file:///tmp/x')).toEqual({ok: false, error: 'Unsupported URL protocol'})
  })
})
