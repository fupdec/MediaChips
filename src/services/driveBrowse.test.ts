import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiClient} from './apiClient'
import {driveBrowserRoot, driveReadablePath, listDriveDirectory} from './driveBrowse'
import {expandNasSelection} from './nasBrowse'
import {remotePathExcluder} from './remoteImportOptions'
vi.mock('./apiClient', () => ({apiClient: {get: vi.fn()}}))
describe('Drive file browser pagination', () => {
  beforeEach(() => vi.clearAllMocks())
  it('uses readable folder and file names for parsing without provider names or missing IDs', () => {
    const titles = {
      [`${driveBrowserRoot}/opaque-1`]: 'Кино',
      [`${driveBrowserRoot}/opaque-1/opaque-2/opaque-3`]: 'Драма.mp4',
    }
    expect(driveReadablePath(`${driveBrowserRoot}/opaque-1/opaque-2/opaque-3`, titles)).toBe('/Кино/Драма.mp4')
    expect(driveReadablePath(driveBrowserRoot, titles)).toBe('/')
  })

  it('remembers names during recursive scans and skips excluded nested Drive folders', async () => {
    const root = driveBrowserRoot
    const titles: Record<string, string> = {}
    vi.mocked(apiClient.get).mockResolvedValueOnce({data: {files: [
      {id: 'skip-id', name: 'Пропустить', isFolder: true},
      {id: 'keep-id', name: 'Драма', isFolder: true},
    ]}} as never).mockResolvedValueOnce({data: {files: [
      {id: 'movie-id', name: 'Кино.mp4', isFolder: false, size: 100},
      {id: 'trailer-id', name: 'trailer.mp4', isFolder: false, size: 100},
    ]}} as never)
    const excludes = remotePathExcluder({parseTags: true, excluded: 'Пропустить\ntrailer'})
    const result = await expandNasSelection({paths: [root], directories: new Set([root]),
      shouldStop: () => false, onFolderError: vi.fn(),
      isExcluded: path => excludes(path) || excludes(driveReadablePath(path, titles)),
      load: async path => {
        const result = await listDriveDirectory({path})
        for (const entry of result.entries) titles[entry.path] = entry.name
        return result
      },
    })
    expect(result.paths).toEqual([`${root}/keep-id/movie-id`])
    expect(driveReadablePath(result.paths[0], titles)).toBe('/Драма/Кино.mp4')
    expect(apiClient.get).toHaveBeenCalledTimes(2)
    expect(apiClient.get).toHaveBeenLastCalledWith('/api/drive/folders/keep-id', expect.anything())
  })
  it('allows common video containers including WMV, MKV and AVI for selection', async () => {
    const names = ['Movie.WMV', 'Movie.mkv', 'Movie.avi', 'Movie.mpeg', 'Movie.flv', 'Movie.mts', 'Movie.m2ts', 'Movie.3gp']
    vi.mocked(apiClient.get).mockResolvedValue({data: {files: names.map((name, index) => ({id: `video-${index}`, name, size: 100, isFolder: false}))}} as never)
    const result = await listDriveDirectory({path: driveBrowserRoot})
    expect(result.entries.every(entry => entry.addable)).toBe(true)
  })
  it('loads every page, filters hidden entries and retains library badges', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({data: {files: [{id: 'folder', name: 'Movies', isFolder: true}], nextPageToken: 'next'}} as never)
      .mockResolvedValueOnce({data: {files: [
        {id: 'movie', name: 'movie.mp4', size: 100, isFolder: false},
        {id: 'image', name: 'photo.jpg', size: 100, isFolder: false, mediaId: 42},
        {id: 'hidden', name: '.hidden.mp4', size: 100, isFolder: false},
        {id: 'doc', name: 'notes.txt', size: 100, isFolder: false},
      ]}} as never)
    const result = await listDriveDirectory({path: driveBrowserRoot})
    expect(apiClient.get).toHaveBeenLastCalledWith('/api/drive/folders/root', expect.objectContaining({params: {pageToken: 'next'}}))
    expect(result.entries.map(entry => entry.name)).toEqual(['Movies', 'movie.mp4', 'photo.jpg', 'notes.txt'])
    expect(result.entries[1].addable).toBe(true)
    expect(result.entries[2]).toMatchObject({inLibrary: true, addable: false, mediaId: 42})
    expect(result.entries[3].addable).toBe(false)
    expect(result.parentPath).toBeNull()
  })
  it('imports beyond the browser limit and stops fetching pages when scanning is cancelled', async () => {
    const files = Array.from({length: 5000}, (_, index) => ({id: `video-${index}`, name: `${index}.mp4`, isFolder: false, size: 100}))
    vi.mocked(apiClient.get).mockResolvedValueOnce({data: {files, nextPageToken: 'next'}} as never)
      .mockResolvedValueOnce({data: {files: [{id: 'last', name: 'last.mp4', isFolder: false, size: 100}]}} as never)
    const result = await listDriveDirectory({path: driveBrowserRoot}, undefined, Infinity)
    expect(result.entries).toHaveLength(5001)
    expect(result.truncated).toBe(false)
    const controller = new AbortController()
    vi.mocked(apiClient.get).mockClear().mockImplementationOnce(async () => {
      controller.abort()
      return {data: {files, nextPageToken: 'next'}} as never
    })
    await expect(listDriveDirectory({path: driveBrowserRoot}, controller.signal, Infinity)).rejects.toMatchObject({name: 'AbortError'})
    expect(apiClient.get).toHaveBeenCalledTimes(1)
  })
  it('preserves the parent path and rejects repeated page tokens instead of looping', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({data: {files: [], nextPageToken: 'same'}} as never)
    await expect(listDriveDirectory({path: `${driveBrowserRoot}/folder`})).rejects.toThrow(/repeated page/)
    expect(apiClient.get).toHaveBeenCalledTimes(2)
  })
})
