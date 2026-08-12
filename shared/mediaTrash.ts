/** Soft-deleted media stay in `media` but are hidden from library queries. */
export const MEDIA_TRASH_RETENTION_DAYS = 30

export const MEDIA_NOT_IN_TRASH_SQL =
  "(media.deletedAt IS NULL OR media.deletedAt = '')"

export function buildTrashPath(mediaId: number, basename?: string | null): string {
  const safeName = String(basename || 'item').replace(/[\\/]/g, '_')
  return `__mediachips_trash__/${Number(mediaId)}/${safeName}`
}

export function isPastTrashRetention(
  deletedAt: string | null | undefined,
  nowMs: number = Date.now(),
  retentionDays: number = MEDIA_TRASH_RETENTION_DAYS,
): boolean {
  if (!deletedAt) return false
  const deletedMs = Date.parse(String(deletedAt))
  if (!Number.isFinite(deletedMs)) return false
  const maxAgeMs = Math.max(1, retentionDays) * 24 * 60 * 60 * 1000
  return nowMs - deletedMs >= maxAgeMs
}
