import {HttpError} from '../types/errors'
import {AsyncLocalStorage} from 'node:async_hooks'

type Lease = {active: boolean; generation: number}
const context = new AsyncLocalStorage<Lease>()
const active = new Set<Lease>()
const restoreContext = new AsyncLocalStorage<boolean>()
let generation = 0
let restoring = false
const restoreListeners = new Set<() => void>()
export function onLibraryRestoreStart(listener: () => void) {
  restoreListeners.add(listener)
  return () => { restoreListeners.delete(listener) }
}
export const bindLibraryOperation = AsyncLocalStorage.bind
const idle = new Set<() => void>()
export const libraryRestoringError = () => Object.assign(new HttpError(409, 'Library restoration is in progress. Try again after it finishes.', {code: 'library_restoring'}), {code: 'library_restoring'})
export const isLibraryRestoring = () => restoring

/** Late callbacks from disconnected clients must not write to a restored library. */
export function assertLibraryOperationCurrent() {
  const lease = context.getStore()
  if (lease && lease.generation !== generation) {
    throw new HttpError(409, 'The library has changed. Retry the operation.', {code: 'library_changed'})
  }
  if (restoring && !lease?.active && !restoreContext.getStore()) throw libraryRestoringError()
}

export function assertLibraryOperationAllowed() {
  assertLibraryOperationCurrent()
  if (restoring && !context.getStore()?.active) throw libraryRestoringError()
}

/** A running operation may finish its nested work while restoration drains it. */
export function beginLibraryOperation() {
  assertLibraryOperationAllowed()
  const lease: Lease = {active: true, generation}
  active.add(lease)
  const release = () => {
    if (!lease.active) return
    lease.active = false
    active.delete(lease)
    if (!active.size) for (const notify of [...idle]) notify()
  }
  return {release, run<T>(action: () => T): T { return context.run(lease, action) }}
}

export async function runLibraryOperation<T>(action: () => T | Promise<T>): Promise<T> {
  const lease = beginLibraryOperation()
  try { return await lease.run(action) } finally { lease.release() }
}

/** Periodic workers skip this pass and resume on their next scheduled tick. */
export async function runLibraryBackgroundTask(action: () => unknown | Promise<unknown>): Promise<void> {
  if (restoring && !context.getStore()?.active) return
  await runLibraryOperation(action)
}

/** New work is blocked before waiting; no files are touched if draining times out. */
export async function withLibraryRestore<T>(action: () => Promise<T>, timeoutMs = 30_000): Promise<T> {
  if (restoring) throw libraryRestoringError()
  restoring = true
  try {
    for (const listener of [...restoreListeners]) listener()
    if (active.size) await new Promise<void>((resolve, reject) => {
      const done = () => { clearTimeout(timer); idle.delete(done); resolve() }
      const timer = setTimeout(() => {
        idle.delete(done)
        reject(Object.assign(new HttpError(409, 'Library operations are still running. Wait for them to finish and retry restoration.', {code: 'library_busy'}), {code: 'library_busy'}))
      }, timeoutMs)
      idle.add(done)
    })
    generation += 1
    return await restoreContext.run(true, action)
  } finally { restoring = false }
}
