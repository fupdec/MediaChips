import {useAppStore} from '@/stores/app'
/** Import notifications are batched with a fixed delay (continuous imports cannot starve it). */
const listeners = new Set<(ids: number[], database: string) => void | Promise<void>>()
const pending = new Map<string, Set<number>>()
let timer: ReturnType<typeof setTimeout> | undefined

export function notifyMediaAdded(ids: number[]): void {
  if (!listeners.size) return
  const database = useAppStore().dbPath
  const batch = pending.get(database) || new Set<number>()
  for (const id of ids) if (Number.isFinite(id) && id > 0) batch.add(id)
  if (batch.size) pending.set(database, batch)
  if (!pending.size || timer) return
  timer = setTimeout(() => {
    timer = undefined
    const batches = [...pending]
    pending.clear()
    for (const [database, ids] of batches) {
      for (const listener of listeners) void Promise.resolve(listener([...ids], database)).catch(console.error)
    }
  }, 400)
}

export function onMediaAdded(listener: (ids: number[], database: string) => void | Promise<void>): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      clearTimeout(timer)
      timer = undefined
      pending.clear()
    }
  }
}
