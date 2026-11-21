import {mediaCopiesRouter} from './MediaCopies.routes'
import type { ApiDb } from '../types/db'
import type { Express } from 'express'

import express from 'express'
import {z} from 'zod'
import {createMediaRelinkController} from '../controllers/MediaRelink.controller'
import { validateBody, validateQuery } from '../middleware/validateBody'
import {
  ItemsListRequestSchema,
  MediaIdsRequestSchema,
  MediaBasicsRequestSchema,
  MediaSimilarByVisualRequestSchema,
  MediaSuggestTagsFromSimilarRequestSchema,
  MediaSemanticSearchRequestSchema,
  MediaSimilarByClipRequestSchema,
  MediaSimilarHybridRequestSchema,
  MediaDuplicateGroupsRequestSchema,
  MergeMediaRequestSchema,
  MediaThumbsRequestSchema,
  MediaPathUpdateRequestSchema,
  DeleteEntityOneRequestSchema,
  MediaDeleteManyRequestSchema,
  MediaTagCountQuerySchema,
  EntityUpdateRequestSchema,
  MediaTrashIdsRequestSchema,
  MediaTrashListQuerySchema,
  MediaFolderBrowseRequestSchema,
} from '../../shared/schemas/requests'
import createMediaController from '../controllers/Media.controller'
import {createMediaSubtitlesController} from '../controllers/MediaSubtitles.controller'
import {listCatalogSources} from '../services/mediaCatalogSources'

export default function registerRoutes(app: Express, db: ApiDb) {
  const Media = createMediaController(db)
  const router = express.Router()
  const relink = createMediaRelinkController(db)
  const subtitles = createMediaSubtitlesController(db)
  const relinkItem = z.object({
    id: z.number().int().positive(),
    oldPath: z.string().min(1),
    newPath: z.string().min(1),
    confirmedOriginal: z.boolean().optional(),
  })
  router.post('/relink/preview', validateBody(z.union([
    relinkItem.omit({confirmedOriginal: true}),
    z.object({oldRoot: z.string().trim().min(1), newRoot: z.string().trim().min(1)}),
  ])), relink.preview)
  router.post('/relink/apply', validateBody(z.object({matches: z.array(relinkItem).min(1)})), relink.apply)

  router.get('/numberOfMediaWithTag', validateQuery(MediaTagCountQuerySchema), Media.numberOfMediaWithTag)

  // Grid availability needs paths only, without per-card copy metadata queries.
  router.post('/copy-paths', validateBody(z.object({
    ids: z.array(z.number().int().positive()).min(1).max(100),
  })), (req, res) => {
    const ids = [...new Set(req.body.ids as number[])]
    const rows = db.sqlite.prepare(
      `SELECT mediaId, path FROM verifiedMediaCopies WHERE mediaId IN (${ids.map(() => '?').join(',')})`,
    ).all(...ids) as {mediaId: number; path: string}[]
    const paths: Record<string, string[]> = Object.fromEntries(ids.map(id => [id, []]))
    for (const row of rows) paths[row.mediaId].push(row.path)
    res.setHeader('Cache-Control', 'no-store')
    res.json({paths})
  })

  router.post('/items', validateBody(ItemsListRequestSchema), Media.getAll)
  router.post('/folderBrowse', validateBody(MediaFolderBrowseRequestSchema), Media.folderBrowse)
  router.post('/ids', validateBody(MediaIdsRequestSchema), Media.getFilteredIds)
  router.post('/basics', validateBody(MediaBasicsRequestSchema), Media.getBasicsByIds)
  router.post('/thumbs', validateBody(MediaThumbsRequestSchema), Media.getThumbs)
  router.post('/similarByVisual', validateBody(MediaSimilarByVisualRequestSchema), Media.similarByVisual)
  router.post('/suggestTagsFromSimilar', validateBody(MediaSuggestTagsFromSimilarRequestSchema), Media.suggestTagsFromSimilar)
  router.post('/similarMarkerMoments', validateBody(z.object({
    tagId: z.number().int().positive(),
    rejected: z.array(z.string().regex(/^\d+:\d+$/)).max(1000).default([]),
  })), Media.similarMarkerMoments)
  router.post('/semanticSearch', validateBody(MediaSemanticSearchRequestSchema), Media.semanticSearch)
  router.post('/similarByClip', validateBody(MediaSimilarByClipRequestSchema), Media.similarByClip)
  router.post('/similarHybrid', validateBody(MediaSimilarHybridRequestSchema), Media.similarHybrid)
  router.post('/duplicateGroups', validateBody(MediaDuplicateGroupsRequestSchema), Media.duplicateGroups)
  router.post('/merge', validateBody(MergeMediaRequestSchema), Media.merge)

  router.get('/get-stats', Media.getStats)
  router.get('/catalogSources', (_req, res) => res.json(listCatalogSources(db)))

  router.get('/trash', validateQuery(MediaTrashListQuerySchema), Media.listTrash)
  router.post('/trash/restore', validateBody(MediaTrashIdsRequestSchema), Media.restoreTrash)
  router.post('/trash/purge', validateBody(MediaTrashIdsRequestSchema), Media.purgeTrash)
  router.post('/trash/purgeExpired', Media.purgeExpiredTrash)

  router.post('/updatePath', validateBody(MediaPathUpdateRequestSchema), Media.updatePath)

  router.put('/:id', validateBody(EntityUpdateRequestSchema), Media.update)

  router.use('/:id/copies', mediaCopiesRouter(db))

  router.get('/:id/subtitles', subtitles.list)
  router.get('/:id/subtitles/:name', subtitles.read)

  router.get('/:id', Media.getOneById)

  router.post('/deleteOne', validateBody(DeleteEntityOneRequestSchema), Media.deleteOne)
  router.post('/deleteMany', validateBody(MediaDeleteManyRequestSchema), Media.deleteMany)

  app.use('/api/Media', router)
}
