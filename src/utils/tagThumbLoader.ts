import { mapWithConcurrency } from '@/utils/mapWithConcurrency'
import { isThumbUnavailable, resolveTagThumbDisplayUrl } from '@/utils/thumbSource'

const DEFAULT_TYPES = ['main', 'avatar', 'alt', 'custom1', 'custom2'] as const
const INDIVIDUAL_LOAD_CONCURRENCY = 8

export function loadTagThumbUrl(
  dbPath: string,
  metaId: number | string,
  tagId: number | string,
  type: string,
): string | null {
  if (!dbPath || metaId == null || tagId == null || !type) return null

  const url = resolveTagThumbDisplayUrl({dbPath, metaId, tagId, type})
  return isThumbUnavailable(url) ? null : url
}

async function loadTagThumbUrlsIndividually(
  dbPath: string,
  metaId: number | string,
  ids: Array<number | string>,
  types: string[],
): Promise<Record<number | string, Record<string, string>>> {
  const thumbs: Record<number | string, Record<string, string>> = {}

  const entries = await mapWithConcurrency(ids, INDIVIDUAL_LOAD_CONCURRENCY, async (id) => {
    const typeMap: Record<string, string> = {}

    for (const type of types) {
      const url = loadTagThumbUrl(dbPath, metaId, id, type)
      if (url) typeMap[type] = url
    }

    return Object.keys(typeMap).length ? [id, typeMap] as const : null
  })

  for (const entry of entries) {
    if (entry) {
      const [id, typeMap] = entry
      thumbs[id] = typeMap
    }
  }

  return thumbs
}

/** Build local file URLs directly — avoids slow base64 batch API. */
export async function loadTagThumbUrls(
  dbPath: string,
  metaId: number | string,
  ids: Array<number | string>,
  types: string[] = [...DEFAULT_TYPES],
): Promise<Record<number | string, Record<string, string>>> {
  const uniqueIds = [...new Set(ids.filter((id) => id != null))]
  if (!uniqueIds.length || !dbPath || metaId == null) return {}

  return loadTagThumbUrlsIndividually(dbPath, metaId, uniqueIds, types)
}
