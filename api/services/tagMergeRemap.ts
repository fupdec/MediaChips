import {uniqueByKey} from '../utils/uniqueIds'

export function remapMediaLinksToSurvivor(
  rows: Array<{mediaId: number; tagId: number; metaId: number}>,
  survivorId: number,
) {
  return uniqueByKey(
    rows.map((row) => ({
      mediaId: row.mediaId,
      tagId: survivorId,
      metaId: row.metaId,
    })),
    (row) => `${row.mediaId}:${row.tagId}:${row.metaId}`,
  )
}

export function remapFolderLinksToSurvivor(
  rows: Array<{folderId: number; tagId: number; metaId: number}>,
  survivorId: number,
) {
  return uniqueByKey(
    rows.map((row) => ({
      folderId: row.folderId,
      tagId: survivorId,
      metaId: row.metaId,
    })),
    (row) => `${row.folderId}:${row.tagId}:${row.metaId}`,
  )
}

export function remapNestedChildLinksToSurvivor(
  rows: Array<{parentTagId: number; tagId: number; metaId: number}>,
  survivorId: number,
) {
  return uniqueByKey(
    rows
      .filter((row) => row.parentTagId !== survivorId)
      .map((row) => ({
        parentTagId: row.parentTagId,
        tagId: survivorId,
        metaId: row.metaId,
      })),
    (row) => `${row.parentTagId}:${row.tagId}:${row.metaId}`,
  )
}

export function remapNestedParentLinksToSurvivor(
  rows: Array<{parentTagId: number; tagId: number; metaId: number}>,
  survivorId: number,
) {
  return uniqueByKey(
    rows
      .filter((row) => row.tagId !== survivorId)
      .map((row) => ({
        parentTagId: survivorId,
        tagId: row.tagId,
        metaId: row.metaId,
      })),
    (row) => `${row.parentTagId}:${row.tagId}:${row.metaId}`,
  )
}

export function remapFilterRowLinksToSurvivor(
  rows: Array<{tagId: number; rowId: number; metaId: number}>,
  survivorId: number,
) {
  return rows.map((row) => ({
    tagId: survivorId,
    rowId: row.rowId,
    metaId: row.metaId,
  }))
}

export function planTagValuesToInsert(
  sourceValues: Array<{metaId: number; value: string | null}>,
  survivorId: number,
  survivorMetaIds: Set<number>,
) {
  const valuesToInsert: Array<{tagId: number; metaId: number; value: string | null}> = []
  const seenMetaIds = new Set<number>()
  for (const row of sourceValues) {
    if (survivorMetaIds.has(row.metaId) || seenMetaIds.has(row.metaId)) continue
    seenMetaIds.add(row.metaId)
    valuesToInsert.push({
      tagId: survivorId,
      metaId: row.metaId,
      value: row.value,
    })
  }
  return valuesToInsert
}

export type NestedTagLink = {
  parentTagId: number
  tagId: number
  metaId: number
}

/** Links to delete when multiple same-name children share a parent+meta. */
export function planNestedNameDedupeDeletes(
  links: NestedTagLink[],
  nameById: Map<number, string>,
  preferredChildIds: Set<number>,
): NestedTagLink[] {
  const groups = new Map<string, NestedTagLink[]>()
  for (const link of links) {
    const name = nameById.get(link.tagId)
    if (!name) continue
    const key = `${link.metaId}:${name}`
    const group = groups.get(key)
    if (group) group.push(link)
    else groups.set(key, [link])
  }

  const toDelete: NestedTagLink[] = []
  for (const group of groups.values()) {
    const unique = [...new Map(group.map((link) => [link.tagId, link])).values()]
    if (unique.length < 2) continue

    unique.sort((a, b) => {
      const aPreferred = preferredChildIds.has(a.tagId) ? 0 : 1
      const bPreferred = preferredChildIds.has(b.tagId) ? 0 : 1
      if (aPreferred !== bPreferred) return aPreferred - bPreferred
      return a.tagId - b.tagId
    })

    toDelete.push(...unique.slice(1))
  }
  return toDelete
}
