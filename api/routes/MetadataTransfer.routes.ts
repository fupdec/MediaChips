import express, {type Express, type Request, type Response} from 'express'
import {z} from 'zod'
import type {ApiDb} from '../types/db'
import {MetadataBundleSchema, MetadataImportSchema, MetadataSelectionSchema} from '../../shared/metadataTransfer'
import {sendControllerError} from '../types/errors'
import {exportMetadata, transferMetadata} from '../services/metadataTransfer/service'
import {metadataSidecars} from '../services/metadataTransfer/sidecars'
import {invalidateMediaDerivedCaches} from '../services/mediaCacheInvalidation'

export default function registerMetadataTransfer(app: Express, db: ApiDb) {
  const router = express.Router()
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  const handle = (action: (req: Request, res: Response) => unknown) => (req: Request, res: Response) => {
    try { action(req, res) } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({message: 'Invalid metadata document', errors: error.issues})
      else sendControllerError(res, error, 'Metadata transfer failed')
    }
  }
  router.post('/export', handle((req, res) => {
    const {mediaIds} = MetadataSelectionSchema.parse(req.body)
    res.attachment('metadata.mediachips.json').json(exportMetadata(db, mediaIds))
  }))
  router.post('/preview', handle((req, res) => res.json(transferMetadata(db, MetadataBundleSchema.parse(req.body)))))
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
