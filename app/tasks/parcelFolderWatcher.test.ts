// @vitest-environment node
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import fs from 'fs'
import {ParcelFolderWatcher} from './parcelFolderWatcher'

describe('settled folder change notifications', () => {
  let watcher: ParcelFolderWatcher
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    watcher = new ParcelFolderWatcher({folderPaths: ['/library'], extensionsByFolder: {'/library': ['mp4']}, excludedPaths: ['/library/excluded']})
  })
  afterEach(async () => { await watcher.close(); vi.useRealTimers(); vi.restoreAllMocks() })
  const events = (input: Array<{type: 'create' | 'update' | 'delete'; path: string}>) => {
    // Feed the same native events as @parcel/watcher without requiring an OS subscription.
    const receiver = watcher as unknown as {handleNativeEvents(events: typeof input, root: string): void}
    receiver.handleNativeEvents(input, '/library')
  }
  it('settles repeated writes into one change notification', async () => {
    const changed = vi.fn(); watcher.on('change', changed)
    for (let n = 0; n < 10; n++) events([{type: 'update', path: '/library/movie.mp4'}])
    expect(changed).not.toHaveBeenCalled()
    await vi.runAllTimersAsync()
    expect(changed.mock.calls).toEqual([['/library/movie.mp4']])
  })
  it('preserves a pending create when later write events arrive', async () => {
    const added = vi.fn(), changed = vi.fn(); watcher.on('add', added).on('change', changed)
    events([{type: 'create', path: '/library/new.mp4'}, {type: 'update', path: '/library/new.mp4'}])
    await vi.runAllTimersAsync()
    expect(added.mock.calls).toEqual([['/library/new.mp4']]); expect(changed).not.toHaveBeenCalled()
  })
  it('honors exclusions and cancels a pending change on deletion or close', async () => {
    const changed = vi.fn(); watcher.on('change', changed)
    events([{type: 'update', path: '/library/excluded/movie.mp4'}, {type: 'update', path: '/library/movie.txt'},
      {type: 'update', path: '/library/deleted.mp4'}, {type: 'delete', path: '/library/deleted.mp4'}, {type: 'update', path: '/library/closing.mp4'}])
    await watcher.close(); await vi.runAllTimersAsync()
    expect(changed).not.toHaveBeenCalled()
  })
})
