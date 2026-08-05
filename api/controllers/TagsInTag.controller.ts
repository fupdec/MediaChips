import type { ApiDb } from '../types/db'
import { createTagsInTagRepository } from '../db/repositories/tagsInTag'
import { createOwnerTagsController } from './createOwnerTagsController'

export default createOwnerTagsController({
  ownerQueryKey: 'tagId',
  deleteFromMethodName: 'deleteFromTag',
  deleteOwnerBodyKey: 'parentTagId',
  createRepository: (db: ApiDb) => {
    const repo = createTagsInTagRepository(db.drizzle)
    return {
      bulkCreate: (body) => repo.bulkCreate(body as never),
      findOrCreate: (body) => repo.findOrCreate(body as never),
      findAllByOwner: (ownerId) => repo.findAllByParentTagId(ownerId),
      deleteByOwner: (ownerId) => repo.deleteByParentTagId(ownerId),
      deleteOne: (ownerId, tagId) => repo.deleteOne(ownerId, tagId),
      deleteByOwnerAndMeta: (itemId, metaId) => repo.deleteByParentTagAndMeta(itemId, metaId),
    }
  },
})
