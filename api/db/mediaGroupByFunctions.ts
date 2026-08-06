import type Database from 'better-sqlite3'
import {
  getItemDiskRoot,
  getItemFirstLetterKey,
  getItemParentPath,
} from '../../shared/itemsGroupBy'

const REGISTERED = new WeakSet<object>()

/** Exact JS parity for path / diskRoot / firstLetter group keys inside SQLite. */
export function registerMediaGroupByFunctions(sqlite: Database.Database): void {
  const key = sqlite as object
  if (REGISTERED.has(key)) return

  sqlite.function('mc_group_parent_path', (value: unknown) => (
    getItemParentPath(value == null ? '' : String(value))
  ))
  sqlite.function('mc_group_disk_root', (value: unknown) => (
    getItemDiskRoot(value == null ? '' : String(value))
  ))
  sqlite.function('mc_group_first_letter', (value: unknown) => (
    getItemFirstLetterKey(value == null ? '' : String(value))
  ))

  REGISTERED.add(key)
}
