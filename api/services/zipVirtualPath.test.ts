import {describe, expect, it} from 'vitest'
import path from 'path'
import {
  buildVirtualZipPath,
  buildZipSkipMessage,
  isEncryptedZipEntry,
  isSafeZipEntryName,
  isVirtualZipPath,
  normalizeZipEntryName,
  parseVirtualZipPath,
} from './zipVirtualPath'

describe('zipVirtualPath', () => {
  it('builds skip messages and detects encrypted entries', () => {
    expect(buildZipSkipMessage('/a.zip', 'too_large')).toContain('too large')
    expect(isEncryptedZipEntry({encryped: true})).toBe(true)
  })

  it('builds and parses virtual zip paths only for .zip!/', () => {
    const zipPath = path.join('/media', 'album.zip')
    const virtual = buildVirtualZipPath(zipPath, 'nested/photo.jpg')
    expect(isVirtualZipPath(virtual)).toBe(true)
    expect(parseVirtualZipPath(virtual)).toEqual({
      zipPath: expect.stringContaining('album.zip'),
      entryName: 'nested/photo.jpg',
    })
    expect(isVirtualZipPath('/Volumes/disk/Back Out Again!/01.jpg')).toBe(false)
  })

  it('rejects unsafe entry names', () => {
    expect(isSafeZipEntryName('../secret.jpg')).toBe(false)
    expect(normalizeZipEntryName('\\folder\\a.JPG')).toBe('folder/a.JPG')
  })
})
