import {PLAYER_ASPECT_MODES, type PlayerAspectMode} from './playerAspect'
import type {PlayerRotation} from './playerVideoGeometry'

/** Aspect ratio and orientation remembered for one library file (e.g. a re-encoded video with a wrong DAR). */
export interface PlayerFileView {
  aspectMode: PlayerAspectMode
  rotation: PlayerRotation
  flipH: boolean
  flipV: boolean
}

export const DEFAULT_PLAYER_FILE_VIEW: Readonly<PlayerFileView> = Object.freeze({
  aspectMode: 'auto',
  rotation: 0,
  flipH: false,
  flipV: false,
})

export const PLAYER_FILE_VIEW_STORAGE_KEY = 'mediachips.player.fileView'
/** Oldest entries are dropped first so the storage cannot grow without bound. */
export const PLAYER_FILE_VIEW_MAX_ENTRIES = 500

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
type Entry = PlayerFileView & { id: number }

const ROTATIONS: readonly number[] = [0, 90, 180, 270]

function sanitizeEntry(raw: unknown): Entry | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const id = Number(value.id)
  if (!Number.isInteger(id) || id <= 0) return null
  if (!PLAYER_ASPECT_MODES.includes(value.aspectMode as PlayerAspectMode)) return null
  if (!ROTATIONS.includes(value.rotation as number)) return null
  return {
    id,
    aspectMode: value.aspectMode as PlayerAspectMode,
    rotation: value.rotation as PlayerRotation,
    flipH: value.flipH === true,
    flipV: value.flipV === true,
  }
}

/** Entries are ordered from the least to the most recently changed. */
function readEntries(storage: StorageLike): Entry[] {
  try {
    const raw = storage.getItem(PLAYER_FILE_VIEW_STORAGE_KEY)
    if (!raw) return []
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.map(sanitizeEntry).filter((entry): entry is Entry => entry != null)
  } catch {
    return []
  }
}

function sameView(a: PlayerFileView, b: PlayerFileView): boolean {
  return a.aspectMode === b.aspectMode && a.rotation === b.rotation && a.flipH === b.flipH && a.flipV === b.flipV
}

export function isDefaultPlayerFileView(view: PlayerFileView): boolean {
  return sameView(view, DEFAULT_PLAYER_FILE_VIEW)
}

export function loadPlayerFileView(storage: StorageLike, mediaId: number): PlayerFileView | null {
  if (!Number.isInteger(mediaId) || mediaId <= 0) return null
  const entry = readEntries(storage).find(item => item.id === mediaId)
  if (!entry) return null
  return {aspectMode: entry.aspectMode, rotation: entry.rotation, flipH: entry.flipH, flipV: entry.flipV}
}

/** Stores a non-default view; the default view removes the entry. Unchanged views do not touch the storage. */
export function savePlayerFileView(storage: StorageLike, mediaId: number, view: PlayerFileView): void {
  if (!Number.isInteger(mediaId) || mediaId <= 0) return
  const entries = readEntries(storage)
  const current = entries.find(item => item.id === mediaId)
  const isDefault = isDefaultPlayerFileView(view)
  if (isDefault && !current) return
  if (current && sameView(current, view)) return

  const next = entries.filter(item => item.id !== mediaId)
  if (!isDefault) {
    next.push({id: mediaId, aspectMode: view.aspectMode, rotation: view.rotation, flipH: view.flipH, flipV: view.flipV})
  }
  try {
    storage.setItem(PLAYER_FILE_VIEW_STORAGE_KEY, JSON.stringify(next.slice(-PLAYER_FILE_VIEW_MAX_ENTRIES)))
  } catch {
    // Without persistent storage the choice just lasts for the current file.
  }
}
