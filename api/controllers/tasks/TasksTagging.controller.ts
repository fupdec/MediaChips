import type { TagLike, AnyRecord, MetaLike } from '../../types/db'
import type { TaskControllerShared, TagSuggestionItem } from '../../types/tasks'
import type { ModelStatus } from '../../types/mlModels'
import { apiErrorMessage, sendControllerError, sendOk } from '../../types/errors'
import {
  runNdjsonAsyncGenerator,
  setNdjsonStreamHeaders,
  writeNdjson,
} from './ndjsonStreamRunner'
import type { ApiRequest, ApiResponse } from '../../types/http'
import type { ParsePathTagEntry } from '@shared/api/responses'
import { createTagsRepository } from '../../db/repositories/tags'
import { createMetaRepository } from '../../db/repositories/meta'
import { createMediaRepository } from '../../db/repositories/media'
import { matchPathsToTags } from '../../services/pathTagMatcher'
import {
  applyParseLibraryTags,
  getParseLibraryTagsStatus,
  iterateParseLibraryTagsPreview,
} from '../../services/parseLibraryTagsPreview'
import { suggestTagsFromMedia } from '../../services/tagSuggester'
import { extractPathRegexTagNames } from '../../../shared/pathParser/regexMeta'
import { resolvePathRegexTagExtracts } from '../../services/pathRegexTagResolver'
import { prepareClipModel } from '../../services/videoClipTagger'
import { iteratePreparedModelDownload } from '../../services/modelDownloadStream'

export default function createTasksTaggingController(shared: TaskControllerShared) {
  const {
    db,
    getParserSettings,
    getVideoClipTagger,
    getEmbeddingModel,
  } = shared

  const mediaRepo = createMediaRepository(db.drizzle)

  const suggestTagsFromPaths = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const settings = await getParserSettings({
        useML: req.query.useML ?? req.body?.settings?.useML,
      })
      const requestPaths = Array.isArray(req.body?.paths) ? req.body.paths : []
      const media = requestPaths.length > 0
        ? requestPaths.map((item: AnyRecord) => ({
          path: typeof item === 'string' ? item : item.path,
        })).filter((item: AnyRecord) => item.path)
        : mediaRepo.findPaths().map((path) => ({path}))
      const suggestions = await suggestTagsFromMedia(db, media, {
        ...settings,
        limit: req.query.limit ?? req.body?.limit,
        maxWords: req.body?.maxWords || 3,
        excludeExisting: req.body?.excludeExisting,
      })

      sendOk(res, {
        words: suggestions.map((i: TagSuggestionItem) => [i.word, Math.round(Number(i.occurrences || 0))]),
        suggestions,
      })
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while suggesting tags.")
    }
  }

  const suggestTagsFromVideoFrames = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const requestPaths = Array.isArray(req.body?.paths) ? req.body.paths : []
      const mediaTypeId = Number(req.body?.mediaTypeId || 1)
      const mediaLimit = Math.max(1, Math.min(Number(req.body?.mediaLimit || 20), 100))
      const locale = req.body?.locale || 'en'

      const pathValues = requestPaths
        .map((item: AnyRecord) => typeof item === 'string' ? item : item.path)
        .filter(Boolean)

      const media = requestPaths.length > 0
        ? mediaRepo.findByPaths(pathValues, mediaTypeId)
        : mediaRepo.findByMediaType(mediaTypeId, {
          limit: mediaLimit,
          orderByCreatedDesc: true,
        })

      const result = await getVideoClipTagger().suggestTagsFromVideoFrames(db, media, {
        locale,
        framesPerVideo: req.body?.framesPerVideo || 4,
        frameWidth: req.body?.frameWidth || 384,
        topK: req.body?.topK || 8,
        minScore: req.body?.minScore || 0.15,
        limit: req.body?.limit || 50,
        excludeExisting: req.body?.excludeExisting,
      })

      sendOk(res, {
        words: result.suggestions.map((i: TagSuggestionItem) => [i.word, i.occurrences]),
        suggestions: result.suggestions,
        frames: result.frames,
        media: result.media,
        model: result.model,
      })
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while suggesting tags from video frames.")
    }
  }

  const streamVideoObjectRecognition = async (req: ApiRequest, res: ApiResponse) => {
    const writeEvent = (event: Record<string, unknown>) => {
      writeNdjson(res, event)
    }

    try {
      setNdjsonStreamHeaders(res)

      const requestPaths = Array.isArray(req.body?.paths) ? req.body.paths : []
      const mediaTypeId = Number(req.body?.mediaTypeId || 1)
      const locale = req.body?.locale || 'en'
      const pathValues = requestPaths
        .map((item: AnyRecord) => typeof item === 'string' ? item : item.path)
        .filter(Boolean)

      const media = pathValues.length > 0
        ? mediaRepo.findByPaths(pathValues, mediaTypeId)
        : []

      const total = media.length
      let processed = 0
      let frames = 0
      let suggestions: TagSuggestionItem[] = []
      const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
      const existingTags = req.body?.excludeExisting === false
        ? []
        : tagsRepo.findAllNames()

      writeEvent({
        type: 'progress',
        processed,
        total,
        remaining: total,
      })

      for (const item of media) {
        const result = await getVideoClipTagger().classifyMedia(db, item, {
          locale,
          framesPerVideo: req.body?.framesPerVideo || 4,
          frameWidth: req.body?.frameWidth || 384,
          topK: req.body?.topK || 8,
          minScore: req.body?.minScore || 0.15,
          limit: req.body?.limit || 50,
          excludeExisting: req.body?.excludeExisting,
          tags: existingTags,
        })

        frames += result.frames
        suggestions = getVideoClipTagger().aggregateFrameResults([
          ...suggestions.flatMap((item: TagSuggestionItem) => (item.samples || []).map((sample) => ({
            key: item.key,
            score: sample.score || item.confidence,
            mediaId: sample.mediaId,
            timestamp: sample.timestamp,
          }))),
          ...result.suggestions.flatMap((item: TagSuggestionItem) => (item.samples || []).map((sample) => ({
            key: item.key,
            score: sample.score || item.confidence,
            mediaId: sample.mediaId,
            timestamp: sample.timestamp,
          }))),
        ], locale, existingTags).slice(0, Number(req.body?.limit || 50))

        processed += 1
        writeEvent({
          type: 'progress',
          processed,
          total,
          remaining: Math.max(total - processed, 0),
          current: item.path,
        })
      }

      writeEvent({
        type: 'complete',
        words: suggestions.map((i: TagSuggestionItem) => [i.word, i.occurrences]),
        suggestions,
        frames,
        media: total,
        model: getVideoClipTagger().CLIP_MODEL,
      })
      res.end()
    } catch (err) {
      writeEvent({
        type: 'error',
        message: apiErrorMessage(err) || "Some error occurred while recognizing video objects."
      })
      res.end()
    }
  }

  const parsePathTags = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const paths = Array.isArray(req.body.paths) ? req.body.paths : []
      const settings = await getParserSettings(req.body.settings || {})
      const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
      const metaRepo = createMetaRepository(db.drizzle)
      const metas = metaRepo.findAll()
      const parserMetas = metas.filter((meta) => meta.parser)
      const parserMetaIds = parserMetas.map((meta) => Number(meta.id))
      const requestedMetaIds = Array.isArray(req.body.metaIds) && req.body.metaIds.length
        ? req.body.metaIds.map(Number)
        : null
      const metaIds = requestedMetaIds?.length
        ? parserMetaIds.filter((metaId) => requestedMetaIds.includes(metaId))
        : parserMetaIds
      const tags = tagsRepo.findByMetaIds(metaIds) as TagLike[]
      const regexMetas = parserMetas.filter((meta) => (
        !requestedMetaIds?.length || requestedMetaIds.includes(Number(meta.id))
      ))

      const eligiblePaths = paths.filter((item: AnyRecord) => item?.path && item?.mediaId)
      const values = matchPathsToTags(eligiblePaths, tags, metas as MetaLike[], {
        ...settings,
        metaIds: req.body.metaIds,
      })

      const merged = new Map<string, ParsePathTagEntry>()
      for (const item of values) {
        const mediaId = Number(item.mediaId)
        const tagId = Number(item.tagId)
        const metaId = Number(item.metaId)
        if (!mediaId || !tagId || !metaId) continue
        merged.set(`${mediaId}:${metaId}:${tagId}`, {mediaId, tagId, metaId})
      }

      for (const item of eligiblePaths) {
        const mediaId = Number(item.mediaId)
        const filePath = String(item.path || '')
        const extracts = extractPathRegexTagNames(filePath, regexMetas)
        if (!extracts.length) continue

        const resolved = resolvePathRegexTagExtracts(extracts, tags, {
          createTag: (metaId, tagName) => {
            const [created] = tagsRepo.bulkCreate([{metaId, name: tagName}])
            return created as TagLike
          },
        })

        for (const match of resolved) {
          merged.set(`${mediaId}:${match.metaId}:${match.tagId}`, {
            mediaId,
            tagId: match.tagId,
            metaId: match.metaId,
          })
        }
      }

      sendOk(res, [...merged.values()])
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while parsing tags.")
    }
  }

  const parserStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const settings = await getParserSettings()
      sendOk(res, getEmbeddingModel().getStatus(db, settings.useML))
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while checking parser status.")
    }
  }

  const downloadParserModel = async (req: ApiRequest, res: ApiResponse) => {
    try {
      await getEmbeddingModel().loadModel(db)
      sendOk(res, getEmbeddingModel().getStatus(db, true))
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while downloading parser model.")
    }
  }

  const clipModelStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      sendOk(res, getVideoClipTagger().getStatus(db))
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while checking CLIP model status.")
    }
  }

  const downloadClipModel = async (req: ApiRequest, res: ApiResponse) => {
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while downloading CLIP model.',
      iterate: (shouldStop) => iteratePreparedModelDownload(
        prepareClipModel,
        (activeDb) => getVideoClipTagger().getStatus(activeDb) as ModelStatus,
        db,
        {shouldStop},
      ),
    })
  }

  const parseLibraryTagsStatus = async (_req: ApiRequest, res: ApiResponse) => {
    try {
      sendOk(res, getParseLibraryTagsStatus(db))
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while checking parse library tags status.")
    }
  }

  const streamParseLibraryTagsPreview = async (req: ApiRequest, res: ApiResponse) => {
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while parsing library tags.',
      iterate: async (shouldStop) => {
        const settings = await getParserSettings(req.body?.settings || {})
        const rawIds = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds : null
        const mediaIds = rawIds
          ? rawIds.map(Number).filter((id: number) => Number.isFinite(id) && id > 0)
          : undefined
        return iterateParseLibraryTagsPreview(db, {
          settings,
          shouldStop,
          ...(mediaIds?.length ? {mediaIds} : {}),
        })
      },
    })
  }

  const applyParseLibraryTagsPreview = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const assignments = Array.isArray(req.body?.assignments) ? req.body.assignments : []
      const result = applyParseLibraryTags(db, assignments)
      sendOk(res, result)
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while applying parsed library tags.")
    }
  }

  return {
    suggestTagsFromPaths,
    suggestTagsFromVideoFrames,
    streamVideoObjectRecognition,
    parsePathTags,
    parseLibraryTagsStatus,
    streamParseLibraryTagsPreview,
    applyParseLibraryTagsPreview,
    parserStatus,
    downloadParserModel,
    clipModelStatus,
    downloadClipModel,
  }
}
