import type { ApiDb } from '../types/db'
import { createValuesInMediaRepository } from '../db/repositories/valuesInMedia'
import { createOwnerValuesController } from './createOwnerValuesController'

export default createOwnerValuesController({
  ownerQueryKey: 'mediaId',
  deleteAllMethodName: 'deleteAllValuesByMediaId',
  createRepository: (db: ApiDb) => {
    const repo = createValuesInMediaRepository(db.drizzle)
    return {
      bulkCreate: (body) => repo.bulkCreate(body as never),
      findAllByOwner: (ownerId) => repo.findAllByMediaId(ownerId),
      deleteOne: (itemId, metaId) => repo.deleteOne(itemId, metaId),
      deleteByOwner: (ownerId) => repo.deleteByMediaId(ownerId),
    }
  },
})
