import type {BackgroundTaskKind, BackgroundTaskSnapshot} from '../../shared/backgroundTasks'

/**
 * Server-side registry of work nobody asked for in the UI (periodic workers, queued jobs).
 * Workers report units of work with `trackBackgroundWork`; subsystems that already keep
 * their own job state register a provider. The Tasks panel polls `listBackgroundTasks`.
 */

/** A worker run stays "running" this long after its last unit, so ticks seconds apart read as one run. */
export const BACKGROUND_RUN_LINGER_MS = 15_000

type Run = {active: number; processed: number; startedAt: number; lastActivityAt: number}
export type BackgroundTaskProviderItem = Omit<BackgroundTaskSnapshot, 'runningMs'>
export type BackgroundTaskProvider = () => BackgroundTaskProviderItem[]

const runs = new Map<BackgroundTaskKind, Run>()
const providers = new Set<BackgroundTaskProvider>()
const providerFirstSeen = new Map<string, number>()
let clock: () => number = Date.now

/** Runs one unit of background work and counts it, whether it succeeds or throws. */
export async function trackBackgroundWork<T>(kind: BackgroundTaskKind, work: () => Promise<T>): Promise<T> {
  const now = clock()
  let run = runs.get(kind)
  if (!run || (run.active === 0 && now - run.lastActivityAt > BACKGROUND_RUN_LINGER_MS)) {
    run = {active: 0, processed: 0, startedAt: now, lastActivityAt: now}
    runs.set(kind, run)
  }
  const current = run
  current.active += 1
  current.lastActivityAt = now
  try {
    return await work()
  } finally {
    current.active -= 1
    current.processed += 1
    current.lastActivityAt = clock()
  }
}

/** Registers a source of already-tracked jobs. Returns the function that removes it again. */
export function registerBackgroundTaskProvider(provider: BackgroundTaskProvider): () => void {
  providers.add(provider)
  return () => { providers.delete(provider) }
}

export function listBackgroundTasks(): BackgroundTaskSnapshot[] {
  const now = clock()
  const tasks: BackgroundTaskSnapshot[] = []
  for (const [kind, run] of runs) {
    if (run.active === 0 && now - run.lastActivityAt > BACKGROUND_RUN_LINGER_MS) continue
    tasks.push({id: kind, kind, processed: run.processed, total: null, unit: 'items', runningMs: now - run.startedAt})
  }

  const seenIds = new Set<string>()
  for (const provider of providers) {
    let items: BackgroundTaskProviderItem[] = []
    try {
      items = provider()
    } catch {
      continue // A provider's library can be closing or switching; it reports again on the next poll.
    }
    for (const item of items) {
      seenIds.add(item.id)
      if (!providerFirstSeen.has(item.id)) providerFirstSeen.set(item.id, now)
      tasks.push({...item, runningMs: now - providerFirstSeen.get(item.id)!})
    }
  }
  for (const id of providerFirstSeen.keys()) {
    if (!seenIds.has(id)) providerFirstSeen.delete(id)
  }
  return tasks
}

/** Test hooks. */
export function setBackgroundTasksClockForTests(next: (() => number) | null): void {
  clock = next ?? Date.now
}

export function resetBackgroundTasksForTests(): void {
  runs.clear()
  providers.clear()
  providerFirstSeen.clear()
  clock = Date.now
}
