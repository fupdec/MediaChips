import type { ApiDb } from '../types/db'
import { createTagsInMediaRepository } from '../db/repositories/tagsInMedia'
import { createOwnerTagsController } from './createOwnerTagsController'

export default createOwnerTagsController({
  ownerQueryKey: 'mediaId',
  deleteFromMethodName: 'deleteFromMedia',
  deleteOwnerBodyKey: 'mediaId',
  createRepository: (db: ApiDb) => {
    const repo = createTagsInMediaRepository(db.drizzle)
    return {
      bulkCreate: (body) => repo.bulkCreate(body as never),
      findOrCreate: (body) => repo.findOrCreate(body as never),
      findAllByOwner: (ownerId) => repo.findAllByMediaId(ownerId),
      deleteByOwner: (ownerId) => repo.deleteByMediaId(ownerId),
      deleteOne: (ownerId, tagId) => repo.deleteOne(ownerId, tagId),
      deleteByOwnerAndMeta: (itemId, metaId) => repo.deleteByMediaAndMeta(itemId, metaId),
    }
  },
})
