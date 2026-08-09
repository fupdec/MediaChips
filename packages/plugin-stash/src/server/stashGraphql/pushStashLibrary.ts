import type {ApiDb} from '../../../../../api/types/db'
import {createMediaRepository} from '../../../../../api/db/repositories/media'
import {createTagsRepository} from '../../../../../api/db/repositories/tags'
import {createTagsInMediaRepository} from '../../../../../api/db/repositories/tagsInMedia'
import {
  mapMediaChipsRatingToStash,
  parseStashOldId,
} from '../stashImport/mapEntities'
import {
  buildSceneUpdateInput,
  createStashGraphqlClient,
} from './stashGraphqlClient'

export type StashPushProgressEvent = {
  type: 'progress'
  phase: string
  processed: number
  total: number
  current?: string
}

export type StashPushProgressCallback = (event: StashPushProgressEvent) => void

export type StashPushCounts = {
  pushed: number
  skipped: number
  failed: number
  errors: string[]
}

export type StashPushResult = StashPushCounts & {ok: true}

export type StashPushOptions = {
  graphqlUrl: string
  apiKey: string
  mediaIds?: number[]
  fetchImpl?: typeof fetch
}

export async function pushStashLibrary(
  db: ApiDb,
  options: StashPushOptions,
  onProgress?: StashPushProgressCallback,
  isAborted?: () => boolean,
): Promise<StashPushResult> {
  const client = createStashGraphqlClient({
    graphqlUrl: options.graphqlUrl,
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
  })

  const mediaRepo = createMediaRepository(db.drizzle)
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const tagsInMediaRepo = createTagsInMediaRepository(db.drizzle)
  const tagById = new Map(tagsRepo.findAllRaw().map((tag) => [tag.id, tag]))

  let candidates = mediaRepo.findOldIdMappings()
    .map((row) => {
      const parsed = parseStashOldId(row.oldId)
      if (!parsed || parsed.kind !== 'scene') return null
      return {id: row.id, sceneId: parsed.id}
    })
    .filter((row): row is {id: number; sceneId: number} => Boolean(row))

  if (options.mediaIds?.length) {
    const allow = new Set(options.mediaIds.map(Number))
    candidates = candidates.filter((row) => allow.has(row.id))
  }

  const counts: StashPushCounts = {
    pushed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }

  const total = candidates.length
  onProgress?.({type: 'progress', phase: 'scenes', processed: 0, total})

  for (let i = 0; i < candidates.length; i++) {
    if (isAborted?.()) throw new Error('Push cancelled')
    const candidate = candidates[i]
    const media = mediaRepo.findById(candidate.id)
    if (!media) {
      counts.skipped += 1
      onProgress?.({
        type: 'progress',
        phase: 'scenes',
        processed: i + 1,
        total,
        current: `scene ${candidate.sceneId}`,
      })
      continue
    }

    const tagIds: number[] = []
    const performerIds: number[] = []
    let studioId: number | null | undefined

    for (const link of tagsInMediaRepo.findAllByMediaId(media.id)) {
      const tag = tagById.get(link.tagId)
      const parsed = parseStashOldId(tag?.oldId)
      if (!parsed) continue
      if (parsed.kind === 'tag') tagIds.push(parsed.id)
      if (parsed.kind === 'performer') performerIds.push(parsed.id)
      if (parsed.kind === 'studio') studioId = parsed.id
    }

    const input = buildSceneUpdateInput({
      sceneId: candidate.sceneId,
      rating: mapMediaChipsRatingToStash(media.rating),
      tagIds: [...new Set(tagIds)],
      performerIds: [...new Set(performerIds)],
      studioId: studioId === undefined ? undefined : studioId,
    })

    try {
      await client.sceneUpdate(input)
      counts.pushed += 1
      onProgress?.({
        type: 'progress',
        phase: 'scenes',
        processed: i + 1,
        total,
        current: media.path || media.name || `scene ${candidate.sceneId}`,
      })
    } catch (error) {
      counts.failed += 1
      const message = error instanceof Error ? error.message : String(error)
      counts.errors.push(`scene ${candidate.sceneId}: ${message}`)
      onProgress?.({
        type: 'progress',
        phase: 'scenes',
        processed: i + 1,
        total,
        current: media.path || media.name || `scene ${candidate.sceneId}`,
      })
    }
  }

  return {ok: true, ...counts}
}
