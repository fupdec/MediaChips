/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {
  getMediaDeleteAssetFolder,
  getMediaTypeKey,
  isAudioMediaType,
  isImageMediaType,
  isManagedMediaType,
  isTextMediaType,
  isVideoMediaType,
  normalizeMediaTypeKey,
} from './mediaType'

describe('api mediaType helpers', () => {
  it('normalizes keys from strings and objects', () => {
    expect(normalizeMediaTypeKey(' Video ')).toBe('video')
    expect(getMediaTypeKey({type: 'IMAGE'})).toBe('image')
    expect(getMediaTypeKey(null)).toBe('')
  })

  it('detects managed media kinds', () => {
    expect(isVideoMediaType('video')).toBe(true)
    expect(isImageMediaType({type: 'image'})).toBe(true)
    expect(isAudioMediaType('audio')).toBe(true)
    expect(isTextMediaType('text')).toBe(true)
    expect(isManagedMediaType('video')).toBe(true)
    expect(isManagedMediaType('other')).toBe(false)
  })

  it('maps delete asset folders', () => {
    expect(getMediaDeleteAssetFolder('video')).toBe('videos')
    expect(getMediaDeleteAssetFolder('image')).toBe('images')
    expect(getMediaDeleteAssetFolder('audio')).toBe('audios')
    expect(getMediaDeleteAssetFolder('text')).toBe('texts')
    expect(getMediaDeleteAssetFolder('other')).toBeNull()
  })
})
