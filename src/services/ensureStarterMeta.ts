import { typedApi } from '@/services/typedApi'
import type { Meta } from '@/types/stores'
import type { AssignedMeta } from '@shared/entities/meta'
import { reloadMetaCatalog } from '@/composable/metaCatalog'
import { reloadTagsCatalog } from '@/composable/appCatalogs'

export interface EnsureStarterMetaResult {
  createdFields: number
  pinnedFields: number
  alreadyReady: boolean
}

type StarterField = {
  key: 'tags'
  name: string
  type: string
  icon: string
  hint: string
  extra?: Record<string, unknown>
}

const STARTER_FIELDS: StarterField[] = [
  {
    key: 'tags',
    name: 'Tags',
    type: 'array',
    icon: 'tag-multiple-outline',
    hint: 'Tags from file paths and folders — rename or extend as you like',
    extra: {
      parser: true,
      pageSetting: {page: 1},
    },
  },
]

function normalizeName(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function findStarterMeta(metas: Meta[], field: StarterField): Meta | undefined {
  return metas.find(
    (meta) => meta.type === field.type && normalizeName(meta.name) === normalizeName(field.name),
  )
}

function findParserTagsMeta(metas: Meta[]): Meta | undefined {
  return metas.find((meta) => meta.type === 'array' && Boolean(meta.parser))
    || metas.find((meta) => meta.type === 'array' && normalizeName(meta.name) === 'tags')
    || metas.find((meta) => meta.type === 'array')
}

/**
 * Creates starter Tags (parser) if missing and pins them to the given media types.
 * Rating/Favorite use built-in media columns — not duplicated as meta fields.
 * Safe to call repeatedly.
 */
export async function ensureStarterMeta({
  mediaTypeIds,
}: {
  mediaTypeIds: number[]
}): Promise<EnsureStarterMetaResult> {
  const targets = mediaTypeIds.filter((id) => Number.isFinite(id) && id > 0)
  const metaResponse = await typedApi.getMeta()
  let allMeta = metaResponse.data || []

  let createdFields = 0
  let pinnedFields = 0

  const ensured: Meta[] = []

  for (const field of STARTER_FIELDS) {
    let meta = findStarterMeta(allMeta, field)
    if (!meta) {
      const created = await typedApi.createMeta({
        type: field.type,
        name: field.name,
        icon: field.icon,
        hint: field.hint,
        ...(field.extra || {}),
      })
      meta = created.data
      allMeta = [...allMeta, meta]
      createdFields += 1
    }
    ensured.push(meta)
  }

  for (const mediaTypeId of targets) {
    const assignedResponse = await typedApi.getAssignedMetaForMediaType(mediaTypeId)
    const assigned: AssignedMeta[] = assignedResponse.data || []
    const assignedMetaIds = new Set(
      assigned
        .filter((row) => row.metaId != null)
        .map((row) => Number(row.metaId)),
    )
    let order = assigned.length

    for (const meta of ensured) {
      if (assignedMetaIds.has(Number(meta.id))) continue
      await typedApi.pinMetaToMediaType({
        metaId: meta.id,
        mediaTypeId,
        order,
      })
      order += 1
      pinnedFields += 1
      assignedMetaIds.add(Number(meta.id))
    }
  }

  if (createdFields > 0 || pinnedFields > 0) {
    await reloadMetaCatalog()
    await reloadTagsCatalog()
  }

  return {
    createdFields,
    pinnedFields,
    alreadyReady: createdFields === 0 && pinnedFields === 0,
  }
}

/**
 * Prefer explicitly configured default category, then parser/name "tags"/first array.
 * `configuredId` is typically settings.defaultTagCategoryId.
 */
export function getDefaultTagCategoryId(
  metas: Meta[] | undefined | null,
  configuredId?: number | string | null,
): number | null {
  const list = metas || []
  const configured = Number(configuredId)
  if (Number.isFinite(configured) && configured > 0) {
    const match = list.find((meta) => meta.type === 'array' && Number(meta.id) === configured)
    if (match?.id != null) return Number(match.id)
  }
  const meta = findParserTagsMeta(list)
  return meta?.id ?? null
}

/** @deprecated Prefer getDefaultTagCategoryId */
export function getDefaultParserTagsMetaId(
  metas: Meta[] | undefined | null,
  configuredId?: number | string | null,
): number | null {
  return getDefaultTagCategoryId(metas, configuredId)
}
