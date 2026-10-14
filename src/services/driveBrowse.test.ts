import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiClient} from './apiClient'
import {driveBrowserRoot, listDriveDirectory} from './driveBrowse'
vi.mock('./apiClient', () => ({apiClient: {get: vi.fn()}}))
describe('Drive file browser pagination', () => {
  beforeEach(() => vi.clearAllMocks())
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
  it('preserves the parent path and rejects repeated page tokens instead of looping', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({data: {files: [], nextPageToken: 'same'}} as never)
    await expect(listDriveDirectory({path: `${driveBrowserRoot}/folder`})).rejects.toThrow(/repeated page/)
    expect(apiClient.get).toHaveBeenCalledTimes(2)
  })
})
