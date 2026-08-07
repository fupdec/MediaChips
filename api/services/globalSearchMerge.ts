import {uniquePositiveIds} from '../utils/uniqueIds'
import type {
  GlobalSearchTagMatchSource,
  GlobalSearchTagResult,
} from './ftsQuery'

export const GLOBAL_SEARCH_MAX_LIMIT = 200
export const GLOBAL_SEARCH_DEFAULT_LIMIT = 50

export type MediaSearchMatchSource = 'name' | 'tag' | 'bookmark' | 'content' | 'both'

export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export function normalizeSearchLimit(value: unknown): number {
  const limit = Number(value)
  if (!Number.isFinite(limit) || limit <= 0) return GLOBAL_SEARCH_DEFAULT_LIMIT
  return Math.min(Math.floor(limit), GLOBAL_SEARCH_MAX_LIMIT)
}

export function normalizeSearchTagIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return uniquePositiveIds(value)
}

export function combineTagMatchSources(
  a: GlobalSearchTagMatchSource | undefined,
  b: GlobalSearchTagMatchSource | undefined,
): GlobalSearchTagMatchSource {
  if (!a) return b || 'name'
  if (!b) return a
  if (a === b) return a
  return 'both'
}

export function combineMediaMatchSources(
  a: MediaSearchMatchSource | undefined,
  b: MediaSearchMatchSource | undefined,
): MediaSearchMatchSource {
  if (!a) return b || 'name'
  if (!b) return a
  if (a === b) return a
  return 'both'
}

export function mergeTagSearchRows(
  primary: GlobalSearchTagResult[],
  secondary: GlobalSearchTagResult[],
  limit: unknown,
): GlobalSearchTagResult[] {
  const sqlLimit = normalizeSearchLimit(limit)
  const merged: GlobalSearchTagResult[] = []
  const byId = new Map<number, GlobalSearchTagResult>()

  for (const row of primary) {
    if (byId.has(row.id)) continue
    const next = {...row}
    byId.set(row.id, next)
    merged.push(next)
    if (merged.length >= sqlLimit) return merged
  }

  for (const row of secondary) {
    const existing = byId.get(row.id)
    if (existing) {
      existing.matchSource = combineTagMatchSources(existing.matchSource, row.matchSource)
      if (row.matchedSynonyms?.length) {
        const synonymSet = new Set([
          ...(existing.matchedSynonyms || []),
          ...row.matchedSynonyms,
        ])
        existing.matchedSynonyms = [...synonymSet]
      }
      if (row.matchedBookmark) {
        existing.matchedBookmark = row.matchedBookmark
      }
      continue
    }

    if (merged.length >= sqlLimit) break
    const next = {...row}
    byId.set(row.id, next)
    merged.push(next)
  }

  return merged
}

export function mergeMediaSearchRows(
  primary: Array<Record<string, unknown>>,
  secondary: Array<Record<string, unknown>>,
  limit: unknown,
) {
  const sqlLimit = normalizeSearchLimit(limit)
  const merged: Array<Record<string, unknown>> = []
  const byId = new Map<number, Record<string, unknown>>()

  for (const row of primary) {
    const id = Number(row.id)
    if (!Number.isFinite(id) || byId.has(id)) continue
    const next = {
      ...row,
      matchSource: (row.matchSource as MediaSearchMatchSource | undefined) || 'name',
    }
    byId.set(id, next)
    merged.push(next)
    if (merged.length >= sqlLimit) return merged
  }

  for (const row of secondary) {
    const id = Number(row.id)
    if (!Number.isFinite(id)) continue

    const existing = byId.get(id)
    if (existing) {
      const existingTags = Array.isArray(existing.matchedTags)
        ? existing.matchedTags as Array<{id: number; name: string}>
        : []
      const nextTags = Array.isArray(row.matchedTags)
        ? row.matchedTags as Array<{id: number; name: string}>
        : []
      const tagById = new Map<number, {id: number; name: string}>()
      for (const tag of [...existingTags, ...nextTags]) {
        tagById.set(Number(tag.id), tag)
      }
      existing.matchedTags = [...tagById.values()]
      existing.matchSource = combineMediaMatchSources(
        existing.matchSource as MediaSearchMatchSource | undefined,
        (row.matchSource as MediaSearchMatchSource | undefined)
          || (nextTags.length ? 'tag' : undefined),
      )
      if (typeof row.matchedBookmark === 'string' && row.matchedBookmark) {
        existing.matchedBookmark = row.matchedBookmark
      }
      if (typeof row.matchedContent === 'string' && row.matchedContent) {
        existing.matchedContent = row.matchedContent
      }
      continue
    }

    if (merged.length >= sqlLimit) break
    const next = {
      ...row,
      matchSource: (row.matchSource as MediaSearchMatchSource | undefined) || 'tag',
    }
    byId.set(id, next)
    merged.push(next)
  }

  return merged
}
