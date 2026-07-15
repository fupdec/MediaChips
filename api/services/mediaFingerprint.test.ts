import {describe, expect, it} from 'vitest'
import {
  FINGERPRINT_SIZE_THRESHOLD_BYTES,
  duplicateParameterForKind,
  getFingerprintValue,
  isFingerprintFilled,
  resolveFingerprintKind,
} from './mediaFingerprint'

describe('mediaFingerprint', () => {
  it('uses oshash for videos above 8 bytes', () => {
    expect(resolveFingerprintKind('video', 9)).toBe('oshash')
    expect(resolveFingerprintKind('video', FINGERPRINT_SIZE_THRESHOLD_BYTES + 1)).toBe('oshash')
    expect(resolveFingerprintKind('video', 8)).toBeNull()
  })

  it('uses contentHash for small non-video files', () => {
    expect(resolveFingerprintKind('image', 1024)).toBe('contentHash')
    expect(resolveFingerprintKind('audio', FINGERPRINT_SIZE_THRESHOLD_BYTES)).toBe('contentHash')
  })

  it('uses oshash for large non-video files', () => {
    expect(resolveFingerprintKind('audio', FINGERPRINT_SIZE_THRESHOLD_BYTES + 1)).toBe('oshash')
    expect(resolveFingerprintKind('image', FINGERPRINT_SIZE_THRESHOLD_BYTES * 2)).toBe('oshash')
  })

  it('treats missing kind as filled and checks the required field otherwise', () => {
    expect(isFingerprintFilled('video', 4, {})).toBe(true)
    expect(isFingerprintFilled('video', 100, {oshash: ''})).toBe(false)
    expect(isFingerprintFilled('video', 100, {oshash: 'abc', contentHash: ''})).toBe(true)
    expect(isFingerprintFilled('image', 100, {contentHash: ''})).toBe(false)
    expect(isFingerprintFilled('image', 100, {contentHash: 'deadbeef'})).toBe(true)
    expect(isFingerprintFilled('audio', FINGERPRINT_SIZE_THRESHOLD_BYTES + 10, {oshash: 'fff'})).toBe(true)
  })

  it('reads the value for the resolved kind', () => {
    expect(getFingerprintValue('oshash', {oshash: ' aaa ', contentHash: 'bbb'})).toBe('aaa')
    expect(getFingerprintValue('contentHash', {oshash: 'aaa', contentHash: ' bbb '})).toBe('bbb')
  })

  it('maps kind to duplicate parameter names', () => {
    expect(duplicateParameterForKind('oshash')).toBe('oshash')
    expect(duplicateParameterForKind('contentHash')).toBe('content_hash')
  })
})
