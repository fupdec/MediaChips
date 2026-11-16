import express, {type Express, type Request, type Response} from 'express'
import {constants} from 'node:fs'
import {open} from 'node:fs/promises'
import path from 'node:path'
import {z} from 'zod'
import type {ApiDb} from '../types/db'
import {MetadataBundleSchema, MetadataImportSchema, MetadataSelectionSchema} from '../../shared/metadataTransfer'
import {HttpError, sendControllerError} from '../types/errors'
import {checkAccess} from '../services/browseOperations'
import {exportMetadata, transferMetadata} from '../services/metadataTransfer/service'
import {metadataSidecars} from '../services/metadataTransfer/sidecars'
import {invalidateMediaDerivedCaches} from '../services/mediaCacheInvalidation'

export default function registerMetadataTransfer(app: Express, db: ApiDb) {
  const router = express.Router()
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  const handle = (action: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
    try { await action(req, res) } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({message: 'Invalid metadata document', errors: error.issues})
      else sendControllerError(res, error, 'Metadata transfer failed')
    }
  }
  router.post('/export', handle((req, res) => {
    const {mediaIds} = MetadataSelectionSchema.parse(req.body)
    res.attachment('metadata.mediachips.json').json(exportMetadata(db, mediaIds))
  }))
  router.post('/preview', handle((req, res) => res.json(transferMetadata(db, MetadataBundleSchema.parse(req.body)))))
  router.post('/preview-file', handle(async (req, res) => {
    const {filePath} = z.object({filePath: z.string().min(1)}).parse(req.body)
    if (!path.isAbsolute(filePath) || path.extname(filePath).toLowerCase() !== '.json') {
      throw new HttpError(400, 'Invalid metadata document')
    }
    const {physical} = await checkAccess(filePath, process.env.MEDIA_CHIPS_MEDIA_ROOTS)
    const maxBytes = 50 * 1024 * 1024
    const file = await open(physical, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW)
    let input: unknown
    try {
      const stats = await file.stat()
      if (!stats.isFile()) throw new HttpError(400, 'Invalid metadata document')
      if (stats.size > maxBytes) throw new HttpError(413, 'Metadata file exceeds 50 MB')
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of file.createReadStream({autoClose: false, end: maxBytes})) {
        size += chunk.length
        if (size > maxBytes) throw new HttpError(413, 'Metadata file exceeds 50 MB')
        chunks.push(chunk)
      }
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
      catch { throw new HttpError(400, 'Invalid metadata document') }
    } finally {
      await file.close()
    }
    const bundle = MetadataBundleSchema.parse(input)
    res.json({bundle, preview: transferMetadata(db, bundle)})
  }))
  router.post('/import', handle((req, res) => {
    const {bundle, ...options} = MetadataImportSchema.parse(req.body)
    const result = transferMetadata(db, bundle, options)
    invalidateMediaDerivedCaches()
    res.json(result)
  }))
  router.post('/sidecars', handle((req, res) => {
    const input = MetadataSelectionSchema.extend({formats: z.array(z.enum(['json', 'xmp', 'nfo'])).min(1).max(3), token: z.string().length(64).optional()}).parse(req.body)
    res.json(metadataSidecars(db, input.mediaIds, input.formats, input.token))
  }))
  app.use('/api/metadata-transfer', router)
}
