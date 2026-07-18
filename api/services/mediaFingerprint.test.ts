import {describe, expect, it} from 'vitest'
import {
  duplicateParameterForKind,
  getFingerprintValue,
  isFingerprintFilled,
  resolveFingerprintKind,
} from './mediaFingerprint'

describe('mediaFingerprint', () => {
  it('uses oshash for all media above 8 bytes', () => {
    expect(resolveFingerprintKind('video', 9)).toBe('oshash')
    expect(resolveFingerprintKind('image', 1024)).toBe('oshash')
    expect(resolveFingerprintKind('audio', 32 * 1024 * 1024)).toBe('oshash')
    expect(resolveFingerprintKind('video', 8)).toBeNull()
    expect(resolveFingerprintKind('image', 0)).toBeNull()
  })

  it('treats missing kind as filled and checks oshash otherwise', () => {
    expect(isFingerprintFilled('video', 4, {})).toBe(true)
    expect(isFingerprintFilled('video', 100, {oshash: ''})).toBe(false)
    expect(isFingerprintFilled('video', 100, {oshash: 'abc', contentHash: ''})).toBe(true)
    expect(isFingerprintFilled('image', 100, {oshash: ''})).toBe(false)
    expect(isFingerprintFilled('image', 100, {oshash: 'deadbeef'})).toBe(true)
  })

  it('reads the oshash value', () => {
    expect(getFingerprintValue('oshash', {oshash: ' aaa ', contentHash: 'bbb'})).toBe('aaa')
  })

  it('maps kind to duplicate parameter names', () => {
    expect(duplicateParameterForKind('oshash')).toBe('oshash')
  })
})
