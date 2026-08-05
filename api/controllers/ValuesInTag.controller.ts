import type { ApiDb } from '../types/db'
import { createValuesInTagRepository } from '../db/repositories/valuesInTag'
import { createOwnerValuesController } from './createOwnerValuesController'

export default createOwnerValuesController({
  ownerQueryKey: 'tagId',
  deleteAllMethodName: 'deleteAllValuesByTagId',
  createRepository: (db: ApiDb) => {
    const repo = createValuesInTagRepository(db.drizzle)
    return {
      bulkCreate: (body) => repo.bulkCreate(body as never),
      findAllByOwner: (ownerId) => repo.findAllByTagId(ownerId),
      deleteOne: (itemId, metaId) => repo.deleteOne(itemId, metaId),
      deleteByOwner: (ownerId) => repo.deleteByTagId(ownerId),
    }
  },
})
