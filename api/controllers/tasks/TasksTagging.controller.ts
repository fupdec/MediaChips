import type { TagLike, AnyRecord, MetaLike } from '../../types/db'
import type { TaskControllerShared, TagSuggestionItem } from '../../types/tasks'
import { apiErrorMessage } from '../../types/errors'
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

export default function createTasksTaggingController(shared: TaskControllerShared) {
  const {
    db,
    getParserSettings,
    getVideoClipTagger,
    getEmbeddingModel,
    createStreamAbortSignal,
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
        : mediaRepo.findAllRaw()
      const suggestions = await suggestTagsFromMedia(db, media, {
        ...settings,
        limit: req.query.limit ?? req.body?.limit,
        maxWords: req.body?.maxWords || 3,
        excludeExisting: req.body?.excludeExisting,
      })

      res.status(201).send({
        words: suggestions.map((i: TagSuggestionItem) => [i.word, Math.round(Number(i.occurrences || 0))]),
        suggestions,
      })
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while suggesting tags."
      })
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
        minScore: req.body?.minScore || 0.03,
        limit: req.body?.limit || 50,
        excludeExisting: req.body?.excludeExisting,
      })

      res.status(201).send({
        words: result.suggestions.map((i: TagSuggestionItem) => [i.word, i.occurrences]),
        suggestions: result.suggestions,
        frames: result.frames,
        media: result.media,
        model: result.model,
      })
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while suggesting tags from video frames."
      })
    }
  }

  const streamVideoObjectRecognition = async (req: ApiRequest, res: ApiResponse) => {
    const writeEvent = (event: Record<string, unknown>) => {
      res.write(`${JSON.stringify(event)}\n`)
    }

    try {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Accel-Buffering', 'no')

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
        : tagsRepo.findAllRaw()

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
          minScore: req.body?.minScore || 0.03,
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
      const parserMetaIds = metas
        .filter((meta) => meta.parser)
        .map((meta) => Number(meta.id))
      const requestedMetaIds = Array.isArray(req.body.metaIds) && req.body.metaIds.length
        ? req.body.metaIds.map(Number)
        : null
      const metaIds = requestedMetaIds?.length
        ? parserMetaIds.filter((metaId) => requestedMetaIds.includes(metaId))
        : parserMetaIds
      const tags = tagsRepo.findByMetaIds(metaIds)

      const eligiblePaths = paths.filter((item: AnyRecord) => item?.path && item?.mediaId)
      const values = matchPathsToTags(eligiblePaths, tags as TagLike[], metas as MetaLike[], {
        ...settings,
        metaIds: req.body.metaIds,
      })

      res.status(201).send(values.map((i: AnyRecord) => ({
        tagId: i.tagId,
        metaId: i.metaId,
        mediaId: i.mediaId,
      })) as ParsePathTagEntry[])
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while parsing tags."
      })
    }
  }

  const parserStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const settings = await getParserSettings()
      res.status(201).send(getEmbeddingModel().getStatus(db, settings.useML))
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while checking parser status."
      })
    }
  }

  const downloadParserModel = async (req: ApiRequest, res: ApiResponse) => {
    try {
      await getEmbeddingModel().loadModel(db)
      res.status(201).send(getEmbeddingModel().getStatus(db, true))
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while downloading parser model."
      })
    }
  }

  const clipModelStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      res.status(201).send(getVideoClipTagger().getStatus(db))
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while checking CLIP model status."
      })
    }
  }

  const downloadClipModel = async (req: ApiRequest, res: ApiResponse) => {
    try {
      await getVideoClipTagger().loadModel(db)
      res.status(201).send(getVideoClipTagger().getStatus(db))
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while downloading CLIP model."
      })
    }
  }

  const parseLibraryTagsStatus = async (_req: ApiRequest, res: ApiResponse) => {
    try {
      res.status(201).send(getParseLibraryTagsStatus(db))
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while checking parse library tags status."
      })
    }
  }

  const streamParseLibraryTagsPreview = async (req: ApiRequest, res: ApiResponse) => {
    const writeEvent = (event: Record<string, unknown>) => {
      res.write(`${JSON.stringify(event)}\n`)
    }

    try {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Accel-Buffering', 'no')

      const settings = await getParserSettings(req.body?.settings || {})
      const shouldStop = createStreamAbortSignal(req, res)

      for await (const event of iterateParseLibraryTagsPreview(db, {
        settings,
        shouldStop,
      })) {
        writeEvent(event)
      }

      res.end()
    } catch (err) {
      writeEvent({
        type: 'error',
        message: apiErrorMessage(err) || "Some error occurred while parsing library tags."
      })
      res.end()
    }
  }

  const applyParseLibraryTagsPreview = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const assignments = Array.isArray(req.body?.assignments) ? req.body.assignments : []
      const result = applyParseLibraryTags(db, assignments)
      res.status(201).send(result)
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while applying parsed library tags."
      })
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
