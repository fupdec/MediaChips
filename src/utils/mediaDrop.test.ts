import {describe, expect, it, vi} from 'vitest'
import {partitionDroppedPaths, startDroppedMediaAdding} from './mediaDrop'

describe('partitionDroppedPaths', () => {
  it('splits files and directories by extension', () => {
    const mediaTypes = [
      {id: 1, type: 'video', extensions: 'mp4,mkv'},
    ] as never

    expect(partitionDroppedPaths([
      '/media/clip.mp4',
      '/media/folder',
      '/media/folder/',
      '/media/song.mp3',
    ], mediaTypes)).toEqual({
      // Known media-type extensions and any other dotted basename both count as files.
      files: ['/media/clip.mp4', '/media/song.mp3'],
      directories: ['/media/folder', '/media/folder/'],
    })
  })

  it('falls back to any dotted basename without mediaTypes', () => {
    expect(partitionDroppedPaths(['/a/b.txt', '/a/b'])).toEqual({
      files: ['/a/b.txt'],
      directories: ['/a/b'],
    })
  })
})

describe('startDroppedMediaAdding', () => {
  it('returns false without paths or resolvable media type', () => {
    const tasksStore = {mediaAdding: {
      media_type_id: null,
      directFiles: [],
      skipFileScan: false,
      paths: '',
      dialogProcess: false,
      active: false,
    }}
    const eventBus = {emit: vi.fn()}

    expect(startDroppedMediaAdding({
      paths: [],
      mediaTypes: [],
      tasksStore,
      eventBus,
    })).toBe(false)

    expect(startDroppedMediaAdding({
      paths: ['/folder'],
      mediaTypes: [],
      tasksStore,
      eventBus,
    })).toBe(false)
  })

  it('configures direct file drop and emits addMedia', () => {
    const tasksStore = {mediaAdding: {
      media_type_id: null as number | null,
      directFiles: [] as unknown[],
      skipFileScan: false,
      paths: '',
      dialogProcess: false,
      active: false,
    }}
    const eventBus = {emit: vi.fn()}
    const mediaTypes = [{id: 7, type: 'video', extensions: 'mp4'}] as never

    expect(startDroppedMediaAdding({
      paths: ['/a/clip.mp4'],
      mediaTypes,
      tasksStore,
      eventBus,
    })).toBe(true)

    expect(tasksStore.mediaAdding).toMatchObject({
      media_type_id: 7,
      directFiles: ['/a/clip.mp4'],
      skipFileScan: true,
      paths: '',
      dialogProcess: true,
      active: true,
    })
    expect(eventBus.emit).toHaveBeenCalledWith('addMedia')
  })
})
