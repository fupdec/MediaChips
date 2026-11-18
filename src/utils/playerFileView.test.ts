import {describe, expect, it} from 'vitest'
import {
  DEFAULT_PLAYER_FILE_VIEW,
  PLAYER_FILE_VIEW_MAX_ENTRIES,
  PLAYER_FILE_VIEW_STORAGE_KEY,
  loadPlayerFileView,
  savePlayerFileView,
  type PlayerFileView,
} from './playerFileView'

function createStorage(initial?: string) {
  let value: string | null = initial ?? null
  let writes = 0
  return {
    getItem: (key: string) => (key === PLAYER_FILE_VIEW_STORAGE_KEY ? value : null),
    setItem: (_key: string, next: string) => { value = next; writes++ },
    get raw() { return value },
    get writes() { return writes },
  }
}

const wide: PlayerFileView = {aspectMode: '16:9', rotation: 90, flipH: true, flipV: false}

describe('playerFileView', () => {
  it('stores and restores a view per media id', () => {
    const storage = createStorage()
    savePlayerFileView(storage, 7, wide)
    expect(loadPlayerFileView(storage, 7)).toEqual(wide)
    expect(loadPlayerFileView(storage, 8)).toBeNull()
  })

  it('removes the entry when the view goes back to the default', () => {
    const storage = createStorage()
    savePlayerFileView(storage, 7, wide)
    savePlayerFileView(storage, 7, {...DEFAULT_PLAYER_FILE_VIEW})
    expect(loadPlayerFileView(storage, 7)).toBeNull()
  })

  it('does not write for unchanged or default views', () => {
    const storage = createStorage()
    savePlayerFileView(storage, 7, {...DEFAULT_PLAYER_FILE_VIEW})
    expect(storage.writes).toBe(0)
    savePlayerFileView(storage, 7, wide)
    savePlayerFileView(storage, 7, {...wide})
    expect(storage.writes).toBe(1)
  })

  it('ignores non-library ids', () => {
    const storage = createStorage()
    savePlayerFileView(storage, 0, wide)
    savePlayerFileView(storage, -3, wide)
    expect(storage.writes).toBe(0)
    expect(loadPlayerFileView(storage, 0)).toBeNull()
  })

  it('survives corrupted storage and drops invalid entries', () => {
    expect(loadPlayerFileView(createStorage('not json'), 7)).toBeNull()
    const bad = JSON.stringify([{id: 7, aspectMode: 'bogus', rotation: 90, flipH: false, flipV: false}])
    expect(loadPlayerFileView(createStorage(bad), 7)).toBeNull()
  })

  it('keeps only the most recent entries', () => {
    const storage = createStorage()
    for (let id = 1; id <= PLAYER_FILE_VIEW_MAX_ENTRIES + 3; id++) savePlayerFileView(storage, id, wide)
    expect(loadPlayerFileView(storage, 1)).toBeNull()
    expect(loadPlayerFileView(storage, 4)).toEqual(wide)
    expect(loadPlayerFileView(storage, PLAYER_FILE_VIEW_MAX_ENTRIES + 3)).toEqual(wide)
  })
})
