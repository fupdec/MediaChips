import {typedApi} from '@/services/typedApi'
import {ensureStarterMeta, getDefaultParserTagsMetaId} from '@/services/ensureStarterMeta'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'

export type ParseLibraryTagAssignment = {
  mediaId: number
  metaId: number
  tagId?: number
  tagName?: string
  willCreate?: boolean
}

export type ImportPathAutoTagResult = {
  applied: number
  createdTags: number
  mediaWithTags: number
  proposed: number
}

type PreviewTag = {
  tagId?: number
  metaId?: number
  tagName?: string
  willCreate?: boolean
  isNew?: boolean
}

type PreviewItem = {
  mediaId?: number
  tags?: PreviewTag[]
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of names) {
    const name = String(raw || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

function resolveParserTagsMetaId(): number | null {
  const appStore = useAppStore()
  const settingsStore = useSettingsStore()
  return getDefaultParserTagsMetaId(appStore.meta, settingsStore.defaultTagCategoryId) ?? null
}

/** Collect new path-tag assignments for a media batch via streaming preview. */
export async function previewImportPathTagAssignments(
  mediaIds: number[],
  options: {signal?: AbortSignal} = {},
): Promise<{assignments: ParseLibraryTagAssignment[]; mediaWithTags: number; proposed: number}> {
  const ids = [...new Set(mediaIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))]
  if (!ids.length) {
    return {assignments: [], mediaWithTags: 0, proposed: 0}
  }

  let items: PreviewItem[] = []
  await typedApi.streamParseLibraryTagsPreview(
    {signal: options.signal, mediaIds: ids},
    (event) => {
      if (event.type === 'complete') {
        items = Array.isArray(event.items) ? (event.items as PreviewItem[]) : []
      }
      if (event.type === 'error') {
        throw new Error(String(event.message || 'Parse library tags failed'))
      }
    },
  )

  const assignments: ParseLibraryTagAssignment[] = []
  for (const item of items) {
    const mediaId = Number(item.mediaId)
    if (!mediaId) continue
    for (const tag of item.tags || []) {
      if (!tag?.isNew) continue
      const metaId = Number(tag.metaId)
      if (!metaId) continue
      assignments.push({
        mediaId,
        metaId,
        tagId: Number(tag.tagId) || undefined,
        tagName: String(tag.tagName || '').trim() || undefined,
        willCreate: Boolean(tag.willCreate) || !(Number(tag.tagId) > 0),
      })
    }
  }

  return {
    assignments,
    mediaWithTags: items.length,
    proposed: assignments.length,
  }
}

export async function applyImportPathAutoTags(
  mediaIds: number[],
  options: {signal?: AbortSignal; ensureStarter?: boolean} = {},
): Promise<ImportPathAutoTagResult> {
  if (options.ensureStarter !== false) {
    const appStore = useAppStore()
    const mediaTypeIds = (appStore.mediaTypes || [])
      .filter((mediaType) => mediaType.type === 'video' || mediaType.type === 'image')
      .map((mediaType) => Number(mediaType.id))
      .filter((id) => id > 0)
    await ensureStarterMeta({mediaTypeIds})
  }

  const preview = await previewImportPathTagAssignments(mediaIds, {signal: options.signal})
  if (!preview.assignments.length) {
    return {applied: 0, createdTags: 0, mediaWithTags: 0, proposed: 0}
  }

  const createdTags = preview.assignments.filter((row) => row.willCreate).length
  const response = await typedApi.applyParseLibraryTags({assignments: preview.assignments})
  const applied = Number(response.data?.applied || 0)
  await reloadTagsCatalog()

  return {
    applied,
    createdTags,
    mediaWithTags: preview.mediaWithTags,
    proposed: preview.proposed,
  }
}

/**
 * Create missing suggested tag names, then re-parse paths so they attach to media
 * whose filenames/folders match.
 */
export async function acceptSuggestedTagsAndAssign(
  names: string[],
  mediaIds: number[],
  options: {signal?: AbortSignal} = {},
): Promise<ImportPathAutoTagResult & {createdNames: string[]}> {
  const unique = uniqueNames(names)
  const metaId = resolveParserTagsMetaId()
  if (!metaId || !unique.length) {
    return {applied: 0, createdTags: 0, mediaWithTags: 0, proposed: 0, createdNames: []}
  }

  const appStore = useAppStore()
  const existing = new Set(
    (appStore.tags || []).map((tag) => String(tag.name || '').trim().toLowerCase()),
  )
  const toCreate = unique.filter((name) => !existing.has(name.toLowerCase()))

  if (toCreate.length > 0) {
    await typedApi.createTags(toCreate.map((name) => ({name, metaId})))
    await reloadTagsCatalog()
  }

  const pathResult = await applyImportPathAutoTags(mediaIds, {
    signal: options.signal,
    ensureStarter: false,
  })

  return {
    ...pathResult,
    createdTags: toCreate.length,
    createdNames: toCreate,
  }
}

/** Create CLIP/object labels and assign each suggestion to its source media IDs. */
export async function applyClipSuggestionsToMedia(
  suggestions: Array<{word?: string; mediaIds?: Array<number | string>}>,
  fallbackMediaIds: number[] = [],
): Promise<ImportPathAutoTagResult> {
  const metaId = resolveParserTagsMetaId()
  if (!metaId) {
    return {applied: 0, createdTags: 0, mediaWithTags: 0, proposed: 0}
  }

  await ensureStarterMeta({
    mediaTypeIds: (useAppStore().mediaTypes || [])
      .filter((mediaType) => mediaType.type === 'video' || mediaType.type === 'image')
      .map((mediaType) => Number(mediaType.id))
      .filter((id) => id > 0),
  })

  const fallback = fallbackMediaIds.filter((id) => Number.isFinite(id) && id > 0)
  const assignments: ParseLibraryTagAssignment[] = []
  const createdNames = new Set<string>()

  for (const suggestion of suggestions) {
    const word = String(suggestion.word || '').trim()
    if (!word) continue
    const mediaIds = (suggestion.mediaIds || [])
      .map(Number)
      .filter((id) => Number.isFinite(id) && id > 0)
    const targets = mediaIds.length ? mediaIds : fallback
    if (!targets.length) continue
    createdNames.add(word.toLowerCase())
    for (const mediaId of targets) {
      assignments.push({
        mediaId,
        metaId,
        tagName: word,
        willCreate: true,
      })
    }
  }

  if (!assignments.length) {
    return {applied: 0, createdTags: 0, mediaWithTags: 0, proposed: 0}
  }

  const response = await typedApi.applyParseLibraryTags({assignments})
  await reloadTagsCatalog()
  return {
    applied: Number(response.data?.applied || 0),
    createdTags: createdNames.size,
    mediaWithTags: new Set(assignments.map((row) => row.mediaId)).size,
    proposed: assignments.length,
  }
}
