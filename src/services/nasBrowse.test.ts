import {describe, expect, it, vi} from 'vitest'
import type {NasConnection} from '@shared/nas'
import type {BrowseDirectoryEntry, BrowseDirectoryResult} from './typedApi/browse'
import {expandNasSelection, listNasDirectory, nasBrowserPath, nasRelativePath} from './nasBrowse'
import {apiClient} from './apiClient'

vi.mock('./apiClient', () => ({apiClient: {get: vi.fn()}}))
const connection: NasConnection = {id: 'nas-id', name: 'NAS', protocol: 'sftp', host: 'nas', port: 22, username: 'reader', root: '/video/', hasCredentials: true, hasPassword: true, hasPrivateKey: false}
const entry = (path: string, isDirectory = false, inLibrary = false): BrowseDirectoryEntry => ({
  path, name: path.split('/').pop()!, isDirectory, inLibrary, addable: !isDirectory && !inLibrary,
  size: 10, mtimeMs: 1000, extension: isDirectory ? null : 'mp4', mediaId: inLibrary ? 1 : null,
})
const directory = (entries: BrowseDirectoryEntry[], truncated = false): BrowseDirectoryResult => ({
  currentPath: '/video', rootPath: '/video', parentPath: null, platform: 'linux', entries, truncated,
})

describe('NAS provider for the shared folder browser', () => {
  it('maps absolute browser paths to relative NAS paths and enforces the configured root', () => {
    expect(nasRelativePath('/video/', '/video')).toBe('')
    expect(nasRelativePath('/video', '/video/Кино/clip 1.mp4')).toBe('Кино/clip 1.mp4')
    expect(nasBrowserPath('/', 'Кино')).toBe('/Кино')
    expect(nasRelativePath('/', '/Кино')).toBe('Кино')
    for (const path of ['/videos/a.mp4', '/etc/passwd', '/video/../a', '/video/a/./b', '/video/a\\b', '/video//a']) {
      expect(() => nasRelativePath('/video', path)).toThrow()
    }
  })
  it('provides sizes, dates, library status, hidden files and only supported importable media', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({data: {path: 'Кино', truncated: false, entries: [
      {name: 'sub', path: 'Кино/sub', isDirectory: true, size: 0, modifiedAt: 1000},
      {name: 'clip.MP4', path: 'Кино/clip.MP4', isDirectory: false, size: 10, modifiedAt: 2000},
      {name: 'old.mp4', path: 'Кино/old.mp4', isDirectory: false, size: 10, mediaId: 7},
      {name: 'notes.txt', path: 'Кино/notes.txt', isDirectory: false, size: 10},
      {name: '.hidden.mov', path: 'Кино/.hidden.mov', isDirectory: false, size: 10},
      {name: 'empty.mp4', path: 'Кино/empty.mp4', isDirectory: false, size: 0},
    ]}} as never)
    const result = await listNasDirectory(connection, {path: '/video/Кино'})
    expect(apiClient.get).toHaveBeenLastCalledWith('/api/nas/connections/nas-id/files', expect.objectContaining({params: {path: 'Кино'}}))
    expect(result).toMatchObject({currentPath: '/video/Кино', rootPath: '/video', parentPath: '/video'})
    expect(result.entries.map(entry => entry.name)).not.toContain('.hidden.mov')
    expect(result.entries[1]).toMatchObject({path: '/video/Кино/clip.MP4', size: 10, mtimeMs: 2000, extension: 'mp4', addable: true})
    expect(result.entries[2]).toMatchObject({inLibrary: true, mediaId: 7, addable: false})
    expect(result.entries[3].addable).toBe(false)
    expect(result.entries[4].addable).toBe(false)
    expect((await listNasDirectory(connection, {path: '/video/Кино', showHidden: true})).entries).toHaveLength(6)
    vi.mocked(apiClient.get).mockResolvedValue({data: {path: '', entries: [], truncated: false}} as never)
    expect((await listNasDirectory(connection, {path: '/video'})).parentPath).toBeNull()
  })
})

describe('NAS folder selection', () => {
  it('walks nested folders, deduplicates overlapping selections and skips existing media', async () => {
    const load = vi.fn(async (path: string) => path === '/video'
      ? directory([entry('/video/sub', true), entry('/video/1.mp4'), entry('/video/old.mp4', false, true)])
      : directory([entry('/video/sub/2.mp4')]))
    const onFolderError = vi.fn()
    const result = await expandNasSelection({paths: ['/video', '/video/sub', '/video/1.mp4'],
      directories: new Set(['/video', '/video/sub']), load, shouldStop: () => false, onFolderError})
    expect(result.paths.sort()).toEqual(['/video/1.mp4', '/video/sub/2.mp4'])
    expect(result.failedFolders).toEqual([])
    expect(load).toHaveBeenCalledTimes(2)
    expect(onFolderError).not.toHaveBeenCalled()
  })
  it('retains inaccessible and truncated folders for retry while continuing other folders', async () => {
    const load = async (path: string) => {
      if (path.endsWith('bad')) throw new Error('Access denied')
      return directory([entry(`${path}/1.mp4`)], path.endsWith('large'))
    }
    const onFolderError = vi.fn()
    const result = await expandNasSelection({paths: ['/video/bad', '/video/large', '/video/ok'],
      directories: new Set(['/video/bad', '/video/large', '/video/ok']), load, shouldStop: () => false, onFolderError})
    expect(result).toEqual({paths: ['/video/ok/1.mp4'], failedFolders: ['/video/bad', '/video/large'], stopped: false})
    expect(onFolderError).toHaveBeenCalledTimes(2)
  })
  it('stops after an in-flight listing without expanding or importing its late files', async () => {
    let stop = false
    const load = vi.fn(async () => { stop = true; return directory([entry('/video/late.mp4')]) })
    const result = await expandNasSelection({paths: ['/video', '/other'], directories: new Set(['/video', '/other']),
      load, shouldStop: () => stop, onFolderError: vi.fn()})
    expect(result).toEqual({paths: [], failedFolders: [], stopped: true})
    expect(load).toHaveBeenCalledTimes(1)
  })
})
