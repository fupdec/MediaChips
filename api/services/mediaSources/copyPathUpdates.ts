import type {ApiDb} from '../../types/db'
import {nasMediaPath, parseNasMediaPath} from '../../../shared/remoteMedia'

const canonical = (value: string) => {
  const nas = parseNasMediaPath(value)
  return nas ? nasMediaPath(nas.connectionId, nas.relativePath) : value
}

/** Call inside the path writer's transaction. Preserve the expected hash; a new validator must be rechecked. */
export function updateVerifiedCopyPath(db: Pick<ApiDb, 'sqlite'>, mediaId: number, oldPath: string, nextPath: string) {
  if (oldPath === nextPath) return
  db.sqlite.prepare("UPDATE OR IGNORE verifiedMediaCopies SET path = ?, availability = 'unknown' WHERE mediaId = ? AND path = ?")
    .run(canonical(nextPath), mediaId, canonical(oldPath))
}
