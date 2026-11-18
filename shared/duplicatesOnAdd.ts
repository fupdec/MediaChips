/** Check newly added cards for duplicates (maintenance similarity policy). */
export const DUPLICATES_ON_ADD_SETTING = 'duplicatesCheckOnAdd'
/** Highest media id already checked; cards above it are new. */
export const DUPLICATES_ON_ADD_CURSOR_SETTING = 'duplicatesCheckOnAddCursor'
/** '1' while the user paused the check from the notifications panel. */
export const DUPLICATES_ON_ADD_PAUSED_SETTING = 'duplicatesCheckOnAddPaused'

export type DuplicatesOnAddEvent = {
  seq: number
  at: string
  /** merged: auto-merged per maintenance policy; found: left for review. */
  kind: 'merged' | 'found'
  /** The newly added card. */
  mediaId: number
  name: string
  itemIds: number[]
  survivorId?: number
  /** Why an auto-merge did not happen. */
  reason?: string
}

export type DuplicatesOnAddStatus = {
  state: 'disabled' | 'idle' | 'running' | 'paused'
  /** Cards added and not yet checked. */
  pending: number
  /** Counters of the current run (since pending last became non-zero). */
  checked: number
  found: number
  merged: number
  /** Card being processed right now. */
  current: string | null
}

export type DuplicatesOnAddEvents = {seq: number; events: DuplicatesOnAddEvent[]; status: DuplicatesOnAddStatus}
