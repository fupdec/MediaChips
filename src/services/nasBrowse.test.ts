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
  it('allows expanded video containers, audio and images for selection and folder import', async () => {
    const names = ['movie.MKV', 'movie.AVI', 'movie.WMV', 'movie.ASF', 'movie.MPEG', 'movie.FLV',
      'movie.MTS', 'movie.M2TS', 'movie.TS', 'movie.3GP', 'movie.OGV', 'music.FLAC', 'music.M4A',
      'photo.AVIF', 'photo.BMP', 'notes.txt', 'page.html']
    vi.mocked(apiClient.get).mockResolvedValue({data: {path: '', entries: names.map(name => ({
      name, path: name, isDirectory: false, size: 100,
    }))}} as never)
    const result = await listNasDirectory(connection, {path: '/video'})
    expect(result.entries.filter(entry => entry.addable).map(entry => entry.name)).toEqual(names.slice(0, -2))
    const expanded = await expandNasSelection({paths: ['/video'], directories: new Set(['/video']),
      load: async () => result, shouldStop: () => false, onFolderError: vi.fn()})
    expect(expanded.paths).toEqual(names.slice(0, -2).map(name => `/video/${name}`))
  })
  it('reads every metadata page for recursive import while keeping browser listings bounded', async () => {
    const entries = Array.from({length: 5000}, (_, index) => ({name: `${index}.mp4`, path: `${index}.mp4`, isDirectory: false, size: 100}))
    vi.mocked(apiClient.get).mockResolvedValueOnce({data: {path: '', entries, truncated: true, nextPageToken: '5000'}} as never)
      .mockResolvedValueOnce({data: {path: '', entries: [{name: 'last.mp4', path: 'last.mp4', isDirectory: false, size: 100}], truncated: false}} as never)
    const result = await listNasDirectory(connection, {path: '/video'}, undefined, Infinity)
    expect(result.entries).toHaveLength(5001)
    expect(result.truncated).toBe(false)
    expect(apiClient.get).toHaveBeenLastCalledWith('/api/nas/connections/nas-id/files', expect.objectContaining({params: {path: '', pageToken: '5000'}}))
    vi.mocked(apiClient.get).mockResolvedValueOnce({data: {path: '', entries, truncated: true, nextPageToken: '5000'}} as never)
    expect((await listNasDirectory(connection, {path: '/video'})).truncated).toBe(true)
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
  it('rechecks overlapping selections when readable names become available during expansion', async () => {
    let namesAvailable = false
    const load = vi.fn(async () => {
      namesAvailable = true
      return directory([entry('/video/skip-folder', true), entry('/video/keep.mp4')])
    })
    const result = await expandNasSelection({paths: ['/video', '/video/skip-folder', '/video/skip-folder/clip.mp4'],
      directories: new Set(['/video', '/video/skip-folder']), load, shouldStop: () => false,
      isExcluded: path => namesAvailable && path.includes('skip-folder'), onFolderError: vi.fn()})
    expect(result.paths).toEqual(['/video/keep.mp4'])
    expect(load).toHaveBeenCalledExactlyOnceWith('/video')
  })
  it('excludes selected files, selected folders and nested folders before loading them', async () => {
    const load = vi.fn(async () => directory([
      entry('/video/skip', true), entry('/video/skip-clip.mp4'), entry('/video/keep.mp4'),
    ]))
    const result = await expandNasSelection({paths: ['/video', '/video/skip', '/video/skip-direct.mp4'],
      directories: new Set(['/video', '/video/skip']), load, shouldStop: () => false,
      isExcluded: path => path.includes('skip'), onFolderError: vi.fn()})
    expect(result).toEqual({paths: ['/video/keep.mp4'], failedFolders: [], stopped: false})
    expect(load).toHaveBeenCalledExactlyOnceWith('/video')
  })
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
  it('reports unique files, existing media and skipped paths across overlapping selections', async () => {
    const onProgress = vi.fn()
    const unsupported = {...entry('/video/notes.txt'), addable: false}
    await expandNasSelection({paths: ['/video', '/video/1.mp4'], directories: new Set(['/video']),
      load: async () => directory([entry('/video/1.mp4'), entry('/video/old.mp4', false, true), entry('/video/skip', true), unsupported]),
      isExcluded: path => path.includes('skip'), shouldStop: () => false, onFolderError: vi.fn(), onProgress})
    expect(onProgress).toHaveBeenLastCalledWith({found: 1, inLibrary: 1, skipped: 2, skippedPaths: ['/video/skip', '/video/notes.txt']})
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
