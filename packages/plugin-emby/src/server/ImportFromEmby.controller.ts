import type {ApiDb} from '../../../../api/types/db'
import createImportFromJellyfinController from '../../../plugin-jellyfin/src/server/ImportFromJellyfin.controller'

/**
 * Emby uses the Jellyfin-compatible MediaBrowser API.
 * Reuse the Jellyfin controller with `emby:` oldId prefixes.
 */
export default function createImportFromEmbyController(db: ApiDb) {
  return createImportFromJellyfinController(db, {oldIdPrefix: 'emby'})
}
