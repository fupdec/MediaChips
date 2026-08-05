import {describe, expect, it} from 'vitest'
import {stripFileUrl} from './stripFileUrl'

describe('stripFileUrl', () => {
  it('leaves plain paths alone', () => {
    expect(stripFileUrl('/Movies/a.mp4')).toBe('/Movies/a.mp4')
    expect(stripFileUrl('  /Movies/a.mp4  ')).toBe('/Movies/a.mp4')
  })

  it('strips file:// prefixes and localhost', () => {
    expect(stripFileUrl('file:///Movies/a.mp4')).toBe('Movies/a.mp4')
    expect(stripFileUrl('file://localhost/Movies/a.mp4')).toBe('/Movies/a.mp4')
  })

  it('unwraps windows drive paths from file urls', () => {
    expect(stripFileUrl('file:///C:/Videos/a.mp4')).toBe('C:/Videos/a.mp4')
  })

  it('decodes percent-encoded paths when possible', () => {
    expect(stripFileUrl('file:///Movies/My%20Film.mp4')).toBe('Movies/My Film.mp4')
  })
})
