import {beforeEach, describe, expect, it, vi} from 'vitest'
import {useFilePreview} from './useFilePreview'

const mocks = vi.hoisted(() => ({playVideo: vi.fn(), emit: vi.fn(), openTextMedia: vi.fn()}))
vi.mock('@/stores/app', () => ({useAppStore: () => ({mediaTypes: [
  {id: 1, type: 'video', extensions: 'mp4,mkv'}, {id: 2, type: 'image', extensions: 'jpg,png'},
  {id: 3, type: 'audio', extensions: 'mp3'},
]})}))
vi.mock('@/stores/items', () => ({useItemsStore: () => ({playVideo: mocks.playVideo})}))
vi.mock('@/utils/eventBus', () => ({useEventBus: () => ({emit: mocks.emit})}))
vi.mock('@/services/fileService', () => ({buildLocalFileUrl: (path: string) => `stream:${path}`}))
vi.mock('@/utils/openTextMedia', () => ({openTextMedia: mocks.openTextMedia}))

describe('source previews without a library identity', () => {
  beforeEach(() => vi.clearAllMocks())
  it.each([
    {name: 'Film.mp4', path: '/movies/Film.mp4', mediaTypeId: 1},
    {name: 'Film.mp4', path: 'gdrive://movie', mediaTypeId: 1},
    {name: 'Film.WMV', path: 'gdrive://movie-wmv', mediaTypeId: 1},
    {name: 'Song.mp3', path: '/music/Song.mp3', mediaTypeId: 3},
  ])('opens $path as a temporary item in its own playlist', async file => {
    const indexedFile = {...file, mediaId: 123}
    await useFilePreview().preview(indexedFile)
    const call = mocks.playVideo.mock.calls[0][0]
    expect(call.video).toMatchObject({id: 0, path: file.path, mediaTypeId: file.mediaTypeId})
    expect(call.videos).toEqual([call.video])
    expect(call.player).toBe('builtin')
  })
  it.each(['/photos/photo.png', 'gdrive://photo'])('opens %s in the viewer source mode without any library IDs', async path => {
    await useFilePreview().preview({name: 'photo.png', path})
    expect(mocks.playVideo).not.toHaveBeenCalled()
    expect(mocks.emit).toHaveBeenCalledWith('viewImage', {sources: [{src: `stream:${path}`, name: 'photo.png'}]})
  })
  it('opens local text without creating a media record', async () => {
    await useFilePreview().preview({name: 'Notes.txt', path: '/notes/Notes.txt'})
    expect(mocks.openTextMedia).toHaveBeenCalledWith(expect.objectContaining({id: 0, path: '/notes/Notes.txt'}))
    expect(mocks.playVideo).not.toHaveBeenCalled()
  })
  it('does not offer folders or unsupported Google document types for streaming', async () => {
    const preview = useFilePreview()
    const folder = {name: 'movie.mp4', path: '/folder', isDirectory: true}
    const document = {name: 'Notes.txt', path: 'gdrive://notes'}
    expect(preview.canPreview(folder)).toBe(false)
    expect(preview.canPreview(document)).toBe(false)
    await preview.preview(folder)
    await preview.preview(document)
    expect(mocks.playVideo).not.toHaveBeenCalled()
    expect(mocks.emit).not.toHaveBeenCalled()
    expect(mocks.openTextMedia).not.toHaveBeenCalled()
  })
})
