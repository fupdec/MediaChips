import { describe, expect, it } from 'vitest'
import {
  getZipArchivePath,
  isVirtualZipPath,
  parseVirtualZipPath,
  zipArchiveBasename,
} from './zipPath'

describe('shared/zipPath', () => {
  it('detects only .zip!/ virtual paths', () => {
    expect(isVirtualZipPath('/media/album.zip!/a.jpg')).toBe(true)
    expect(isVirtualZipPath('Back Out Again!/01.jpg')).toBe(false)
    expect(isVirtualZipPath('/media/photo.jpg')).toBe(false)
  })

  it('parses archive path and basename', () => {
    expect(parseVirtualZipPath('/media/album.zip!/nested/a.jpg')).toEqual({
      zipPath: '/media/album.zip',
      entryName: 'nested/a.jpg',
    })
    expect(getZipArchivePath('/media/album.zip!/a.jpg')).toBe('/media/album.zip')
    expect(zipArchiveBasename('/media/photos/album.zip')).toBe('album.zip')
  })
})
