import path from 'path-browserify'
import { getLocalImage } from '@/services/fileService'
import { typedApi } from '@/services/typedApi'
import { mapWithConcurrency } from '@/utils/mapWithConcurrency'

const DEFAULT_TYPES = ['main', 'avatar', 'alt', 'custom1', 'custom2'] as const
const INDIVIDUAL_LOAD_CONCURRENCY = 8

export async function loadTagThumbUrl(
  dbPath: string,
  metaId: number | string,
  tagId: number | string,
  type: string,
): Promise<string | null> {
  if (!dbPath || metaId == null || tagId == null || !type) return null

  const imgPath = path.join(dbPath, 'meta', String(metaId), `${tagId}_${type}.jpg`)
  const url = await getLocalImage(imgPath)
  if (!url || url.includes('unavailable.png')) return null
  return url
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
      const url = await loadTagThumbUrl(dbPath, metaId, id, type)
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

export async function loadTagThumbUrls(
  dbPath: string,
  metaId: number | string,
  ids: Array<number | string>,
  types: string[] = [...DEFAULT_TYPES],
): Promise<Record<number | string, Record<string, string>>> {
  const uniqueIds = [...new Set(ids.filter((id) => id != null))]
  if (!uniqueIds.length || !dbPath || metaId == null) return {}

  try {
    const response = await typedApi.postTagThumbs({
      metaId: Number(metaId),
      ids: uniqueIds,
      types,
    })
    return response.data?.thumbs ?? {}
  } catch {
    return loadTagThumbUrlsIndividually(dbPath, metaId, uniqueIds, types)
  }
}
