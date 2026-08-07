import type { ApiDb } from '../types/db'
import { createFaceEnrollmentsRepository } from '../db/repositories/faceEnrollments'
import { createFacesRepository } from '../db/repositories/faces'
import { createMetaRepository } from '../db/repositories/meta'
import { createSettingsRepository } from '../db/repositories/settings'
import { createTagsRepository } from '../db/repositories/tags'
import { createTagsInMediaRepository } from '../db/repositories/tagsInMedia'
import { createMediaRepository } from '../db/repositories/media'
import {
  loadModel as loadDetectionModel,
} from './faceDetector'
import { isMatchableStoredFace } from './matchGates'
import {clusterFacesInMedia} from './faceCluster'
import {
  embeddingToJson,
  parseEnrollmentRefs,
} from './faceMatchScoring'
import {
  EMBED_MODEL_ID,
  EMBED_MODEL_SIZE_MB,
  embedImage,
  getEmbedStatus,
  hasDownloadedEmbedModel,
  loadEmbedModel,
  prepareEmbedModel,
} from './faceEmbedRuntime'
import {ensureFaceCropsForMedia} from './faceCropStore'
import {
  findTagImagePaths,
  resolveAbsoluteCropPath as resolveAbsoluteCropPathFromDb,
} from './faceEnrollmentPaths'
import {applyBlindPersonTagsForMedia} from './faceBlindAutoTag'
import {
  uniqueMediaTagApplies,
  type FaceMatchMode,
} from './faceMatchApply'
import {
  prepareMatchFacesForMedia,
  resolveClusterMatchesForMedia,
  resolveMatchMediaFacesGate,
} from './faceMediaMatchResolve'
import {
  buildClearedFaceMatchResult,
  buildClearedFaceMatchUpdate,
  filterExistingMediaIds,
  resolveAssignFaceToPerformerGate,
  resolveAssignMatchFields,
  resolveFaceFoundGate,
} from './faceAssignMatch'
import {
  enrollTagFromAllImages,
} from './faceEnrollTag'
import {
  buildFaceMatchStatusSnapshot,
  resolveConfiguredOrScraperMetaId,
} from './faceStatusSnapshots'
import { resolveFaceEmbedding } from './faceEmbedLoad'
import {parseFaceMatchSettingsFromMap} from './faceSettingsParse'
import {
  applyFaceMatchMediaResult,
  buildFaceMatchCompleteEvent,
  buildFaceMatchProgressEvent,
  createFaceMatchIterateCounters,
  markFaceMatchIterateFailed,
  resolveIterateFaceMatchingGate,
} from './faceMatchIterate'
import {
  applyFaceEnrollTagOutcome,
  buildEnrollTagFacesClearResult,
  buildEnrollTagFacesCreatedResult,
  buildEnrollTagFacesSkipResult,
  buildFaceEnrollCompleteEvent,
  buildFaceEnrollProgressEvent,
  classifyEnrollAttempt,
  createFaceEnrollIterateCounters,
  prepareEnrollTagPending,
  resolveEnrollTagFacesPlan,
  resolveIterateEnrollGate,
} from './faceEnrollIterate'
import {
  assembleListedFacesForMedia,
  buildListedPreparedFacesFromRows,
} from './faceListBuild'
import {createCachedTagResolver} from './faceListPresentation'

export type {FaceMatchMode}

export interface FaceMatchSettings {
  performerMetaId: number | null
  minConfidence: number
  candidateLimit: number
  mode: FaceMatchMode
  matchAfterDetect: boolean
  autoBlindTags: boolean
}

/** Preloaded settings + parsed enrollment gallery for multi-media match runs. */
export type FaceMatchBatchContext = {
  settings: FaceMatchSettings
  enrollments: Array<{tagId: number; embedding: Float32Array}>
}

export interface FaceMatchProgressEvent {
  type: 'progress' | 'complete' | 'error' | 'status'
  phase?: 'downloading_embed' | 'downloading_align' | 'embed_ready'
  processed?: number
  total?: number
  remaining?: number
  matched?: number
  applied?: number
  enrolled?: number
  skipped?: number
  failed?: number
  current?: string
  mediaId?: number
  message?: string
  sizeMb?: number
  stopped?: boolean
}

function resolvePerformerMetaId(db: ApiDb, configuredId?: number | null): number | null {
  return resolveConfiguredOrScraperMetaId(
    configuredId,
    createMetaRepository(db.drizzle).findAll(),
  )
}

function getFaceMatchSettings(db: ApiDb): FaceMatchSettings {
  const options = [
    'faceMatch.performerMetaId',
    'faceMatch.minConfidence',
    'faceMatch.candidateLimit',
    'faceMatch.mode',
    'faceMatch.matchAfterDetect',
    'faceMatch.autoBlindTags',
  ]
  const rows = createSettingsRepository(db.drizzle).findByOptions(options)
  const map = new Map(rows.map((row) => [String(row.option), row.value]))
  return parseFaceMatchSettingsFromMap(map, (configuredId) =>
    resolvePerformerMetaId(db, configuredId),
  )
}

function resolveAbsoluteCropPath(db: ApiDb, cropPath: string | null | undefined) {
  return resolveAbsoluteCropPathFromDb(String(db.path || ''), cropPath)
}

/** Prefer stored embedding; fall back to legacy crop files. */
async function loadFaceEmbedding(
  db: ApiDb,
  face: {embedding?: string | null; cropPath?: string | null},
): Promise<Float32Array | null> {
  return resolveFaceEmbedding({
    embedding: face.embedding,
    cropPath: face.cropPath,
    resolveCropPath: (cropPath) => resolveAbsoluteCropPath(db, cropPath),
    embedFromPath: (path) => embedImage(db, path),
  })
}

async function* iterateEnrollFromPerformerImages(
  db: ApiDb,
  {
    shouldStop = () => false,
    force = false,
    metaId: metaIdOverride,
  }: {
    shouldStop?: () => boolean
    force?: boolean
    metaId?: number | null
  } = {},
): AsyncGenerator<FaceMatchProgressEvent> {
  const settings = getFaceMatchSettings(db)
  const gate = resolveIterateEnrollGate({
    performerMetaId: resolvePerformerMetaId(db, metaIdOverride ?? settings.performerMetaId),
  })
  if (!gate.ok) {
    yield gate.event
    return
  }
  const {metaId} = gate

  await loadDetectionModel(db)
  yield* prepareEmbedModel(db)

  const tags = createTagsRepository(db.drizzle, db.sqlite).findByMetaIds([metaId])
  const enrollmentsRepo = createFaceEnrollmentsRepository(db.drizzle)
  const total = tags.length
  let counters = createFaceEnrollIterateCounters()

  yield buildFaceEnrollProgressEvent(counters, total)

  for (const tag of tags) {
    if (shouldStop()) {
      yield buildFaceEnrollCompleteEvent(counters, total, true)
      return
    }

    const tagId = Number(tag.id)
    const existing = enrollmentsRepo.findByTagId(tagId)
    const imagePaths = findTagImagePaths(String(db.path), metaId, tagId)
    const {skipReason} = prepareEnrollTagPending({
      imagePaths,
      existingRows: existing,
      dbPath: String(db.path || ''),
      force,
    })

    if (skipReason) {
      counters = applyFaceEnrollTagOutcome(counters, skipReason)
      yield buildFaceEnrollProgressEvent(counters, total, {
        current: tag.name || String(tagId),
      })
      continue
    }

    let outcome: ReturnType<typeof classifyEnrollAttempt>
    try {
      const created = await enrollTagFromAllImages(db, tagId, metaId, imagePaths, {force})
      outcome = classifyEnrollAttempt({created})
    } catch {
      outcome = 'failed'
    }

    counters = applyFaceEnrollTagOutcome(counters, outcome)
    yield buildFaceEnrollProgressEvent(counters, total, {
      current: tag.name || String(tagId),
    })
  }

  yield buildFaceEnrollCompleteEvent(counters, total, false)
}

function loadFaceMatchBatchContext(
  db: ApiDb,
  settings?: FaceMatchSettings,
): FaceMatchBatchContext {
  const resolved = settings || getFaceMatchSettings(db)
  const metaId = resolved.performerMetaId
  const enrollments = metaId
    ? parseEnrollmentRefs(
      createFaceEnrollmentsRepository(db.drizzle).findByMetaId(metaId),
    )
    : []
  return {settings: resolved, enrollments}
}

async function matchMediaFaces(
  db: ApiDb,
  mediaId: number,
  options: {
    force?: boolean
    settings?: FaceMatchSettings
    context?: FaceMatchBatchContext
  } = {},
) {
  const settings = options.context?.settings || options.settings || getFaceMatchSettings(db)
  const metaId = settings.performerMetaId
  const facesRepo = createFacesRepository(db.drizzle)
  const faces = metaId ? facesRepo.findByMediaId(mediaId) : []
  const enrollments = options.context
    ? options.context.enrollments
    : (metaId && faces.length
      ? parseEnrollmentRefs(
        createFaceEnrollmentsRepository(db.drizzle).findByMetaId(metaId),
      )
      : [])

  const gate = resolveMatchMediaFacesGate({
    metaId,
    facesCount: faces.length,
    enrollmentsCount: enrollments.length,
  })
  const canBlind = Boolean(settings.autoBlindTags && metaId && faces.length)

  if (!gate.ok && !canBlind) return gate.result

  let matched = 0
  let applied = 0
  let skipped = 0

  if (gate.ok) {
    await loadEmbedModel(db)

    const preparedResult = await prepareMatchFacesForMedia({
      faces,
      force: options.force,
      enrollments,
      candidateLimit: settings.candidateLimit,
      loadEmbedding: (face) => loadFaceEmbedding(db, face),
      isMatchable: isMatchableStoredFace,
    })
    skipped = preparedResult.skipped

    const clustered = clusterFacesInMedia(preparedResult.prepared)
    const resolved = resolveClusterMatchesForMedia({
      clustered,
      enrollments,
      candidateLimit: settings.candidateLimit,
      minConfidence: settings.minConfidence,
      mode: settings.mode,
      mediaId,
      metaId: Number(metaId),
    })
    matched = resolved.matched

    for (const {faceId, update} of resolved.updates) {
      facesRepo.updateMatch(faceId, update)
    }

    if (resolved.tagsToApply.length) {
      const unique = uniqueMediaTagApplies(resolved.tagsToApply)
      createTagsInMediaRepository(db.drizzle).bulkCreate(unique)
      applied = unique.length
    }
  } else {
    skipped = faces.length
  }

  let blindTagsCreated = 0
  let blindFacesApplied = 0
  if (canBlind) {
    const blind = applyBlindPersonTagsForMedia(db, mediaId, {
      metaId: Number(metaId),
    })
    blindTagsCreated = blind.createdTags
    blindFacesApplied = blind.appliedFaces
    if (blind.createdTags) applied += blind.createdTags
  }

  return {
    matched,
    applied,
    skipped,
    faces: faces.length,
    blindTagsCreated,
    blindFacesApplied,
  }
}

async function assignFaceToPerformer(
  db: ApiDb,
  faceId: number,
  tagId: number,
  options: {enroll?: boolean; applyTag?: boolean; matchScore?: number | null} = {},
) {
  const facesRepo = createFacesRepository(db.drizzle)
  const face = facesRepo.findById(faceId)
  const tag = createTagsRepository(db.drizzle, db.sqlite).findById(tagId)
  const gate = resolveAssignFaceToPerformerGate({
    faceFound: Boolean(face),
    tagMetaId: tag?.metaId != null ? Number(tag.metaId) : null,
  })
  if (!gate.ok) throw new Error(gate.error)

  const metaId = gate.metaId
  // Opt-in: picking a face only binds suggestion unless applyTag is explicitly true.
  const applyTag = options.applyTag === true
  const enroll = options.enroll === true
  const fields = resolveAssignMatchFields({
    applyTag,
    matchScore: options.matchScore,
    existingMatchScore: face!.matchScore,
  })
  facesRepo.updateMatch(faceId, {
    tagId,
    ...fields,
  })

  if (applyTag) {
    createTagsInMediaRepository(db.drizzle).bulkCreate([{
      mediaId: Number(face!.mediaId),
      tagId,
      metaId,
    }])
  }

  if (enroll) {
    try {
      let embeddingJson: string | null = face!.embedding ? String(face!.embedding) : null
      if (!embeddingJson) {
        const cropPath = resolveAbsoluteCropPath(db, face!.cropPath)
        if (cropPath) {
          const embedding = await embedImage(db, cropPath)
          embeddingJson = embeddingToJson(embedding)
        }
      }
      if (embeddingJson) {
        createFaceEnrollmentsRepository(db.drizzle).create({
          tagId,
          metaId,
          source: 'faceCrop',
          sourcePath: face!.cropPath || `face:${faceId}`,
          embedding: embeddingJson,
        })
      }
    } catch (err) {
      console.warn('[faceRecognition] enroll after assign failed:', err)
    }
  }

  return {faceId, tagId, metaId, mediaId: Number(face!.mediaId)}
}

function clearFaceMatch(db: ApiDb, faceId: number) {
  const facesRepo = createFacesRepository(db.drizzle)
  const face = facesRepo.findById(faceId)
  const gate = resolveFaceFoundGate(Boolean(face))
  if (!gate.ok) throw new Error(gate.error)

  facesRepo.updateMatch(faceId, buildClearedFaceMatchUpdate())

  return buildClearedFaceMatchResult({
    faceId,
    mediaId: face!.mediaId,
  })
}

async function listFacesForMedia(db: ApiDb, mediaId: number, options: {
  candidates?: boolean
  ensureCrops?: boolean
} = {}) {
  const facesRepo = createFacesRepository(db.drizzle)
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const settings = getFaceMatchSettings(db)

  // Review UI needs crops for this video only; rebuild if auto-scan skipped them.
  // Callers can skip this for a fast first paint, then request crops in a follow-up.
  if (options.ensureCrops !== false) {
    try {
      await ensureFaceCropsForMedia(db, mediaId)
    } catch {
      // Listing should still work without preview crops.
    }
  }

  // Re-read after crop paths may have been written.
  const faceRows = facesRepo.findByMediaId(mediaId)
  const enrollmentRefs = settings.performerMetaId && options.candidates !== false
    ? parseEnrollmentRefs(
      createFaceEnrollmentsRepository(db.drizzle).findByMetaId(settings.performerMetaId),
    )
    : []

  // Prefer stored vectors for listing — never warm the ONNX embed model here.
  const resolveTag = createCachedTagResolver({
    initialTags: settings.performerMetaId
      ? tagsRepo.findByMetaIds([settings.performerMetaId])
      : [],
    getId: (tag) => Number(tag.id),
    findById: (tagId) => tagsRepo.findById(tagId),
  })

  const prepared = buildListedPreparedFacesFromRows({
    faceRows,
    enrollmentRefs,
    candidateLimit: settings.candidateLimit,
    resolveTag,
  })

  return assembleListedFacesForMedia({
    mediaId,
    prepared,
    enrollmentRefs,
    candidateLimit: settings.candidateLimit,
    resolveTag,
  })
}

async function* iterateFaceMatching(
  db: ApiDb,
  {
    shouldStop = () => false,
    force = false,
    mediaIds,
  }: {
    shouldStop?: () => boolean
    force?: boolean
    mediaIds?: number[]
  } = {},
): AsyncGenerator<FaceMatchProgressEvent> {
  const settings = getFaceMatchSettings(db)
  const enrollmentsCount = settings.performerMetaId
    ? createFaceEnrollmentsRepository(db.drizzle).countByMetaId(settings.performerMetaId)
    : 0
  const gate = resolveIterateFaceMatchingGate({
    performerMetaId: settings.performerMetaId,
    enrollmentsCount,
  })
  if (!gate.ok) {
    yield gate.event
    return
  }

  yield* prepareEmbedModel(db)

  // Load gallery once after model-space migration may have pruned enrollments.
  const context = loadFaceMatchBatchContext(db, settings)
  const facesRepo = createFacesRepository(db.drizzle)
  const mediaRepo = createMediaRepository(db.drizzle)
  const requestedIds = mediaIds?.length ? mediaIds : facesRepo.findDistinctMediaIds()
  const mediaById = new Map(
    mediaRepo.findByIds(
      requestedIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)),
    ).map((row) => [row.id, row]),
  )
  const ids = filterExistingMediaIds(
    requestedIds,
    (id) => mediaById.has(id),
  )

  const total = ids.length
  let counters = createFaceMatchIterateCounters()

  yield buildFaceMatchProgressEvent(counters, total)

  for (const mediaId of ids) {
    if (shouldStop()) {
      yield buildFaceMatchCompleteEvent(counters, total, true)
      return
    }

    try {
      const result = await matchMediaFaces(db, mediaId, {force, context})
      counters = applyFaceMatchMediaResult(counters, result)
    } catch {
      counters = markFaceMatchIterateFailed(counters)
    }

    const media = mediaById.get(mediaId)
    yield buildFaceMatchProgressEvent(counters, total, {
      current: media?.path || String(mediaId),
      mediaId,
    })
  }

  yield buildFaceMatchCompleteEvent(counters, total, false)
}

async function enrollTagFaces(
  db: ApiDb,
  tagId: number,
  options: {force?: boolean} = {},
) {
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const tag = tagsRepo.findById(tagId)
  const settings = getFaceMatchSettings(db)
  const imagePaths = tag?.metaId
    ? findTagImagePaths(String(db.path), Number(tag.metaId), tagId)
    : []
  const plan = resolveEnrollTagFacesPlan({
    tagFound: Boolean(tag?.metaId),
    metaId: tag?.metaId != null ? Number(tag.metaId) : null,
    performerMetaId: settings.performerMetaId,
    imagePaths,
    force: options.force,
  })

  if (plan.kind === 'skip') {
    return buildEnrollTagFacesSkipResult(tagId, plan.metaId, plan.reason)
  }

  if (plan.kind === 'clear-empty') {
    // Photo removed — clear stale references for this tag.
    if (plan.clearEnrollments) {
      createFaceEnrollmentsRepository(db.drizzle).deleteByTagId(tagId)
    }
    return buildEnrollTagFacesClearResult(tagId, plan.metaId)
  }

  await loadDetectionModel(db)
  await loadEmbedModel(db)
  const created = await enrollTagFromAllImages(db, tagId, plan.metaId, plan.imagePaths, {
    force: options.force !== false,
  })
  return buildEnrollTagFacesCreatedResult(tagId, plan.metaId, created)
}

function getFaceMatchStatus(db: ApiDb) {
  const settings = getFaceMatchSettings(db)
  const facesRepo = createFacesRepository(db.drizzle)
  const enrollmentsRepo = createFaceEnrollmentsRepository(db.drizzle)
  const metaId = settings.performerMetaId
  const performerTags = metaId
    ? createTagsRepository(db.drizzle, db.sqlite).findByMetaIds([metaId]).length
    : 0

  return buildFaceMatchStatusSnapshot({
    settings,
    embedModel: getEmbedStatus(db),
    faces: facesRepo.countAll(),
    matchedFaces: facesRepo.countMatched(),
    performerTags,
    enrolledFaces: metaId ? enrollmentsRepo.countByMetaId(metaId) : 0,
    enrolledTags: metaId ? enrollmentsRepo.countDistinctTagsByMetaId(metaId) : 0,
  })
}

export {
  EMBED_MODEL_ID,
  EMBED_MODEL_SIZE_MB,
  assignFaceToPerformer,
  clearFaceMatch,
  embedImage,
  embeddingToJson,
  enrollTagFaces,
  getEmbedStatus,
  getFaceMatchSettings,
  getFaceMatchStatus,
  hasDownloadedEmbedModel,
  iterateEnrollFromPerformerImages,
  iterateFaceMatching,
  listFacesForMedia,
  loadEmbedModel,
  loadFaceMatchBatchContext,
  matchMediaFaces,
  prepareEmbedModel,
  resolvePerformerMetaId,
}
