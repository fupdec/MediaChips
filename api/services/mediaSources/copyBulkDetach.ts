import {eq, isNull} from 'drizzle-orm'
import type {ApiDb} from '../../types/db'
import {media} from '../../db/schema/media'
import {verifiedMediaCopies} from '../../db/schema/mediaCopies'
import type {DetachCopiesQuery, DetachCopiesPreview, DetachCopiesResult, DetachCopyPlanItem} from '../../../shared/mediaCopiesBulk'
import {detachMediaCopy} from './copies'
import {sourceError} from './context'

export const DETACH_PREVIEW_LIMIT = 500

const normalize = (value: string) => value.trim().replace(/\\/g, '/').replace(/\/+$/, '')
const driveLetter = /^[a-z]:(\/|$)/i

/** Directory-boundary prefix match: `/a/b` covers `/a/b/c.mp4` but not `/a/bc/d.mp4`. Windows drive paths ignore case. */
export function pathUnderPrefix(path: string, prefix: string): boolean {
  const target = normalize(path), root = normalize(prefix)
  if (!root) return false
  const fold = driveLetter.test(root)
  const a = fold ? target.toLowerCase() : target, b = fold ? root.toLowerCase() : root
  return a === b || a.startsWith(b + '/')
}

function plan(db: ApiDb, query: DetachCopiesQuery) {
  if (!normalize(query.prefix)) throw sourceError('prefix_required', 400)
  const rows = db.drizzle.select({id: verifiedMediaCopies.id, mediaId: verifiedMediaCopies.mediaId, path: verifiedMediaCopies.path,
    availability: verifiedMediaCopies.availability, title: media.name})
    .from(verifiedMediaCopies).innerJoin(media, eq(media.id, verifiedMediaCopies.mediaId)).where(isNull(media.deletedAt)).all()
  const byCard = new Map<number, typeof rows>()
  for (const row of rows) byCard.set(row.mediaId, [...(byCard.get(row.mediaId) || []), row])
  const items: DetachCopyPlanItem[] = []
  let skippedAllMatch = 0
  for (const [mediaId, copies] of byCard) {
    const matching = copies.filter(copy => pathUnderPrefix(copy.path, query.prefix) && (!query.onlyUnavailable || copy.availability === 'unavailable'))
    if (!matching.length) continue
    const keep = copies.filter(copy => !matching.includes(copy))
    if (!keep.length) { skippedAllMatch += 1; continue }
    items.push({mediaId, title: copies[0].title || '',
      detach: matching.map(copy => ({copyId: copy.id, path: copy.path, availability: copy.availability})),
      keep: keep.map(copy => ({path: copy.path, availability: copy.availability}))})
  }
  items.sort((a, b) => a.mediaId - b.mediaId)
  return {items, skippedAllMatch}
}

export function previewDetachCopies(db: ApiDb, query: DetachCopiesQuery): DetachCopiesPreview {
  const {items, skippedAllMatch} = plan(db, query)
  return {cards: items.slice(0, DETACH_PREVIEW_LIMIT), limit: DETACH_PREVIEW_LIMIT, totalCards: items.length,
    totalCopies: items.reduce((sum, item) => sum + item.detach.length, 0), skippedAllMatch}
}

/**
 * Detaches every matching copy through the single-card routine, so preferences, location rows and the card's own path
 * are handled the same way as in the card editor. Files are never deleted. Each card is atomic; a failure is reported
 * and does not stop the others. `expectedCopies` guards against applying a plan other than the one the user reviewed.
 */
export function applyDetachCopies(db: ApiDb, query: DetachCopiesQuery & {expectedCopies: number}): DetachCopiesResult {
  const {items} = plan(db, query)
  const total = items.reduce((sum, item) => sum + item.detach.length, 0)
  if (total !== query.expectedCopies) throw sourceError('plan_changed', 409)
  const result: DetachCopiesResult = {cards: 0, copies: 0, failed: []}
  for (const item of items) {
    try {
      db.drizzle.transaction(() => { for (const copy of item.detach) detachMediaCopy(db, item.mediaId, copy.copyId) })
      result.cards += 1
      result.copies += item.detach.length
    } catch (err) {
      result.failed.push({mediaId: item.mediaId, code: (err as {code?: string}).code || 'copy_operation_failed'})
    }
  }
  return result
}
