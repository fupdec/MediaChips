import type {DrizzleClient} from '../../db/client'
import {buildPathLookupVariants} from '../../utils/normalizeUserPath'
import {createMediaRepository, type MediaRow} from '../../db/repositories/media'

export type SourceMediaRow = MediaRow

export function findMatchingTargetMedia(
  targetDrizzle: DrizzleClient,
  sourceRow: SourceMediaRow,
): SourceMediaRow | null {
  const mediaRepo = createMediaRepository(targetDrizzle)

  if (sourceRow.path) {
    const variants = buildPathLookupVariants(sourceRow.path)
    const byPath = mediaRepo.findByPathVariants(variants)
    if (byPath) return byPath
  }

  if (sourceRow.contentHash) {
    const byHash = mediaRepo.findByContentHash(
      sourceRow.contentHash,
      sourceRow.mediaTypeId ?? undefined,
    )
    if (byHash) return byHash
  }

  if (sourceRow.oshash) {
    const byOshash = mediaRepo.findByOshash(
      sourceRow.oshash,
      sourceRow.mediaTypeId ?? undefined,
    )
    if (byOshash) return byOshash
  }

  return null
}

export function isEmptyScalar(value: unknown): boolean {
  return value == null || value === '' || value === 0
}

/** Target wins: only fill empty target fields from source. */
export function buildNullFillPatch(
  target: SourceMediaRow,
  source: SourceMediaRow,
): Partial<SourceMediaRow> {
  const keys: Array<keyof SourceMediaRow> = [
    'basename',
    'name',
    'ext',
    'filesize',
    'contentHash',
    'oshash',
    'visualHash',
    'visualHashTiles',
    'bookmark',
    'viewedAt',
    'mediaCreatedAt',
    'oldId',
  ]
  const patch: Partial<SourceMediaRow> = {}
  for (const key of keys) {
    if (isEmptyScalar(target[key]) && !isEmptyScalar(source[key])) {
      ;(patch as Record<string, unknown>)[key] = source[key]
    }
  }
  // Prefer richer engagement numbers only when target is zero/empty.
  if (!target.favorite && source.favorite) patch.favorite = true
  if ((!target.rating || target.rating === 0) && source.rating) patch.rating = source.rating
  if ((!target.views || target.views === 0) && source.views) patch.views = source.views
  return patch
}
