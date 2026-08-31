/** Soft-deleted entities stay in their tables but are hidden from normal lists. */
export const ENTITY_TRASH_RETENTION_DAYS = 30

/** Alias used by media trash helpers. */
export const MEDIA_TRASH_RETENTION_DAYS = ENTITY_TRASH_RETENTION_DAYS

export type TrashEntityKind = 'media' | 'tag' | 'mark' | 'playlist' | 'savedFilter'

export function notInTrashSql(tableAlias: string): string {
  return `(${tableAlias}.deletedAt IS NULL OR ${tableAlias}.deletedAt = '')`
}

export function inTrashSql(tableAlias: string): string {
  return `(${tableAlias}.deletedAt IS NOT NULL AND ${tableAlias}.deletedAt != '')`
}

export const TRASH_TAG_NAME_PREFIX = '__mediachips_trash__/'

export function isTrashTagName(name: string | null | undefined): boolean {
  return String(name || '').startsWith(TRASH_TAG_NAME_PREFIX)
}

/** Free unique name indexes while a tag is in trash (mirrors media path rewrite). */
export function buildTrashTagName(tagId: number, originalName?: string | null): string {
  const safe = String(originalName || 'tag').replace(/[\\/]/g, '_').trim() || 'tag'
  return `${TRASH_TAG_NAME_PREFIX}${Number(tagId)}/${safe}`
}

export function isPastTrashRetention(
  deletedAt: string | null | undefined,
  nowMs: number = Date.now(),
  retentionDays: number = ENTITY_TRASH_RETENTION_DAYS,
): boolean {
  if (!deletedAt) return false
  const deletedMs = Date.parse(String(deletedAt))
  if (!Number.isFinite(deletedMs)) return false
  const maxAgeMs = Math.max(1, retentionDays) * 24 * 60 * 60 * 1000
  return nowMs - deletedMs >= maxAgeMs
}
