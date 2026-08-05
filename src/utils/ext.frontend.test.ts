import {describe, expect, it} from 'vitest'
import {getExtensionOptions, normalizeExt, parseExtList} from './ext'

describe('frontend ext helpers', () => {
  it('normalizes and parses lists', () => {
    expect(normalizeExt('MP4')).toBe('.mp4')
    expect(parseExtList('mp4, avi')).toEqual(['.mp4', '.avi'])
  })

  it('builds sorted unique extension options from media type', () => {
    expect(getExtensionOptions({extensions: 'mp4, .AVI, mp4, '})).toEqual(['.avi', '.mp4'])
    expect(getExtensionOptions(null)).toEqual([])
  })
})
