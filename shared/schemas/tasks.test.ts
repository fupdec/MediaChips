import { describe, expect, it } from 'vitest'
import {
  parseBackupList,
  parseClipModelStatus,
  parseDatabaseSizesResponse,
  parseFileExistsResponse,
  parseFileListResponse,
  parseFolderSizeResponse,
  parseMediaIdsResponse,
  parseMediaPathSearchResults,
  parseAddMediaResponse,
  parseResolvePathResponse,
  parseWatchedFolderLinks,
} from '@shared/schemas'

describe('task schemas', () => {
  it('parses file exists and resolve path', () => {
    expect(parseFileExistsResponse({ exists: true })).toEqual({ exists: true })
    expect(parseResolvePathResponse({ exists: false })).toEqual({ exists: false })
  })

  it('parses file list and folder size', () => {
    expect(parseFileListResponse({
      files: ['/a.mp4', '/b.mp4'],
      skippedZips: [],
    })).toEqual({
      files: ['/a.mp4', '/b.mp4'],
      skippedZips: [],
    })
    expect(parseFolderSizeResponse({ size: 2048 }).size).toBe(2048)
  })

  it('parses media ids and clip model status', () => {
    expect(parseMediaIdsResponse({ ids: [1, 2, 3] }).ids).toEqual([1, 2, 3])
    expect(parseClipModelStatus({ status: 'ready' }).status).toBe('ready')
  })

  it('parses backup list', () => {
    const backups = parseBackupList([{ name: 'backup.zip', size: 100 }])
    expect(backups[0]?.name).toBe('backup.zip')
  })

  it('rejects invalid file list', () => {
    expect(() => parseFileListResponse({ bad: true })).toThrow()
    expect(() => parseFileListResponse(['/a.mp4'])).toThrow()
  })

  it('parses database sizes and watched folder links', () => {
    expect(parseDatabaseSizesResponse({ sizes: { db1: 1024 } }).sizes?.db1).toBe(1024)
    const links = parseWatchedFolderLinks([
      {
        folderId: 1,
        mediaType: { id: 2, type: 'video', name: 'Videos' },
        watchedFolder: { path: '/media' },
      },
    ])
    expect(links[0]?.folderId).toBe(1)
  })

  it('parses media path search and add media responses', () => {
    const files = parseMediaPathSearchResults([{ id: 1, path: '/videos/a.mp4' }])
    expect(files[0]?.path).toBe('/videos/a.mp4')

    const created = parseAddMediaResponse({ id: 42, name: 'a.mp4' })
    expect(created.id).toBe(42)

    const duplicate = parseAddMediaResponse({
      message: 'Media already added.',
      duplicate: { id: 7, path: '/old.mp4' },
    })
    expect(duplicate.duplicate?.id).toBe(7)
  })
})
