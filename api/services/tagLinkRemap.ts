import {uniqueByKey} from '../utils/uniqueIds'

/** OR-merge boolean capability flags from source rows onto a survivor. */
export function orBooleanFlags<T extends Record<string, unknown>>(
  survivor: T,
  sources: T[],
  keys: readonly string[],
): Partial<T> {
  const patch: Record<string, unknown> = {}
  for (const key of keys) {
    const anyEnabled = Boolean(survivor[key]) || sources.some((row) => Boolean(row[key]))
    if (anyEnabled !== Boolean(survivor[key])) {
      patch[key] = anyEnabled
    } else if (anyEnabled) {
      patch[key] = true
    }
  }
  return patch as Partial<T>
}

export function remapMediaTagLinksMetaId(
  rows: Array<{mediaId: number; tagId: number; metaId: number}>,
  survivorMetaId: number,
) {
  return uniqueByKey(
    rows.map((row) => ({
      mediaId: row.mediaId,
      tagId: row.tagId,
      metaId: survivorMetaId,
    })),
    (row) => `${row.mediaId}:${row.tagId}:${row.metaId}`,
  )
}

export function remapFolderTagLinksMetaId(
  rows: Array<{folderId: number; tagId: number; metaId: number}>,
  survivorMetaId: number,
) {
  return uniqueByKey(
    rows.map((row) => ({
      folderId: row.folderId,
      tagId: row.tagId,
      metaId: survivorMetaId,
    })),
    (row) => `${row.folderId}:${row.tagId}:${row.metaId}`,
  )
}

export function remapNestedTagLinksMetaId(
  rows: Array<{parentTagId: number; tagId: number; metaId: number}>,
  survivorMetaId: number,
) {
  return uniqueByKey(
    rows.map((row) => ({
      parentTagId: row.parentTagId,
      tagId: row.tagId,
      metaId: survivorMetaId,
    })),
    (row) => `${row.parentTagId}:${row.tagId}:${row.metaId}`,
  )
}

export function remapFilterRowTagLinksMetaId(
  rows: Array<{tagId: number; rowId: number; metaId: number}>,
  survivorMetaId: number,
) {
  return uniqueByKey(
    rows.map((row) => ({
      tagId: row.tagId,
      rowId: row.rowId,
      metaId: survivorMetaId,
    })),
    (row) => `${row.tagId}:${row.rowId}:${row.metaId}`,
  )
}
