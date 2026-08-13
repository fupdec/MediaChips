/** Soft-deleted media stay in `media` but are hidden from library queries. */
export {
  ENTITY_TRASH_RETENTION_DAYS as MEDIA_TRASH_RETENTION_DAYS,
  isPastTrashRetention,
  notInTrashSql,
} from './entityTrash'

import {notInTrashSql} from './entityTrash'

export const MEDIA_NOT_IN_TRASH_SQL = notInTrashSql('media')

export function buildTrashPath(mediaId: number, basename?: string | null): string {
  const safeName = String(basename || 'item').replace(/[\\/]/g, '_')
  return `__mediachips_trash__/${Number(mediaId)}/${safeName}`
}
