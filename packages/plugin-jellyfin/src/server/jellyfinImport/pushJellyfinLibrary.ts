import type {ApiDb} from '../../../../../api/types/db'
import {createMediaRepository} from '../../../../../api/db/repositories/media'
import {createTagsRepository} from '../../../../../api/db/repositories/tags'
import {createTagsInMediaRepository} from '../../../../../api/db/repositories/tagsInMedia'
import {createJellyfinClient} from './jellyfinClient'
import {
  mapMediaChipsRatingToJellyfin,
  parseJellyfinItemOldId,
} from './mapEntities'
import type {JellyfinOldIdPrefix} from './types'

export type JellyfinPushProgressEvent = {
  type: 'progress'
  phase: string
  processed: number
  total: number
  current?: string
}

export type JellyfinPushProgressCallback = (event: JellyfinPushProgressEvent) => void

export type JellyfinPushCounts = {
  pushed: number
  skipped: number
  failed: number
  errors: string[]
}

export type JellyfinPushResult = JellyfinPushCounts & {ok: true}

export type JellyfinPushOptions = {
  baseUrl: string
  apiKey: string
  oldIdPrefix?: JellyfinOldIdPrefix
  mediaIds?: number[]
  fetchImpl?: typeof fetch
}

function parseGenreNameFromOldId(oldId: string, prefix: JellyfinOldIdPrefix): string | null {
  const needle = `${prefix}:genre:`
  if (!oldId.startsWith(needle)) return null
  const rest = oldId.slice(needle.length)
  if (rest.startsWith('name:')) return rest.slice('name:'.length).trim() || null
  return null
}

export async function pushJellyfinLibrary(
  db: ApiDb,
  options: JellyfinPushOptions,
  onProgress?: JellyfinPushProgressCallback,
  isAborted?: () => boolean,
): Promise<JellyfinPushResult> {
  const prefix = options.oldIdPrefix || 'jellyfin'
  const client = createJellyfinClient({
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
  })

  const mediaRepo = createMediaRepository(db.drizzle)
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const tagsInMediaRepo = createTagsInMediaRepository(db.drizzle)

  const tagById = new Map(
    tagsRepo.findAllRaw().map((tag) => [tag.id, tag]),
  )

  const itemPrefix = `${prefix}:item:`
  let candidates = mediaRepo.findOldIdMappings()
    .filter((row) => row.oldId && String(row.oldId).startsWith(itemPrefix))
    .map((row) => ({
      id: row.id,
      remoteId: parseJellyfinItemOldId(row.oldId, prefix),
    }))
    .filter((row): row is {id: number; remoteId: string} => Boolean(row.remoteId))

  if (options.mediaIds?.length) {
    const allow = new Set(options.mediaIds.map(Number))
    candidates = candidates.filter((row) => allow.has(row.id))
  }

  const counts: JellyfinPushCounts = {
    pushed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }

  const total = candidates.length
  onProgress?.({type: 'progress', phase: 'items', processed: 0, total})

  for (let i = 0; i < candidates.length; i++) {
    if (isAborted?.()) throw new Error('Push cancelled')
    const candidate = candidates[i]
    const media = mediaRepo.findById(candidate.id)
    if (!media) {
      counts.skipped += 1
      onProgress?.({
        type: 'progress',
        phase: 'items',
        processed: i + 1,
        total,
        current: candidate.remoteId,
      })
      continue
    }

    const genreNames = new Set<string>()
    for (const link of tagsInMediaRepo.findAllByMediaId(media.id)) {
      const tag = tagById.get(link.tagId)
      if (!tag?.oldId) continue
      const oldId = String(tag.oldId)
      const fromNameId = parseGenreNameFromOldId(oldId, prefix)
      if (fromNameId) {
        genreNames.add(fromNameId)
        continue
      }
      if (oldId.startsWith(`${prefix}:genre:`) && tag.name) {
        genreNames.add(String(tag.name).trim())
      }
    }

    try {
      await client.updateItemMetadata(candidate.remoteId, {
        communityRating: mapMediaChipsRatingToJellyfin(media.rating),
        genres: [...genreNames],
      })
      counts.pushed += 1
      onProgress?.({
        type: 'progress',
        phase: 'items',
        processed: i + 1,
        total,
        current: media.path || media.name || candidate.remoteId,
      })
    } catch (error) {
      counts.failed += 1
      const message = error instanceof Error ? error.message : String(error)
      counts.errors.push(`${candidate.remoteId}: ${message}`)
      onProgress?.({
        type: 'progress',
        phase: 'items',
        processed: i + 1,
        total,
        current: media.path || media.name || candidate.remoteId,
      })
    }
  }

  return {ok: true, ...counts}
}
