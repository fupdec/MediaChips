import {apiClient, getApiBaseUrl} from './apiClient'
import {getAuthToken} from './authSession'

type Pending = {resolve: (paths: string[]) => void; reject: (error: unknown) => void}
const pending = new Map<string, Map<number, Pending[]>>()
const currentScope = () => `${getApiBaseUrl()}|${getAuthToken()}`

/** Coalesce missing-original checks from cards mounted in the same frame. */
export function queueMediaCopyPaths(id: number): Promise<string[]> {
  const scope = currentScope()
  let queue = pending.get(scope)
  if (!queue) {
    queue = new Map()
    pending.set(scope, queue)
    const batch = queue
    setTimeout(() => {
      pending.delete(scope)
      if (scope !== currentScope()) {
        for (const entries of batch.values()) {
          for (const entry of entries) entry.resolve([])
        }
        return
      }
      const ids = [...batch.keys()]
      for (let start = 0; start < ids.length; start += 100) {
        const chunk = ids.slice(start, start + 100)
        void apiClient.post<{paths: Record<string, string[]>}>('/api/Media/copy-paths', {ids: chunk})
          .then(({data}) => {
            for (const mediaId of chunk) {
              for (const entry of batch.get(mediaId)!) entry.resolve(scope === currentScope() ? data.paths[mediaId] ?? [] : [])
            }
          }).catch(error => {
            for (const mediaId of chunk) {
              for (const entry of batch.get(mediaId)!) entry.reject(error)
            }
          })
      }
    }, 32)
  }
  return new Promise((resolve, reject) => {
    const entries = queue!.get(id) ?? []
    entries.push({resolve, reject})
    queue!.set(id, entries)
  })
}
