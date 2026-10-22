// @vitest-environment node
import {describe, expect, it} from 'vitest'
import {assertLibraryOperationCurrent, beginLibraryOperation, isLibraryRestoring, runLibraryBackgroundTask, runLibraryOperation, withLibraryRestore} from './libraryMaintenance'
import {createConcurrencyQueue} from './concurrencyQueue'
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => {resolve = done}); return {promise, resolve} }

describe('exclusive library restoration', () => {
  it('drains existing work, blocks new jobs and resumes workers after restoration', async () => {
    const work = deferred(), restore = deferred()
    const events: string[] = []
    const task = runLibraryOperation(async () => { await work.promise; events.push('work finished') })
    const restoring = withLibraryRestore(async () => { events.push('restore started'); await restore.promise })
    expect(isLibraryRestoring()).toBe(true)
    expect(events).toEqual([])
    await expect(runLibraryOperation(async () => {})).rejects.toMatchObject({code: 'library_restoring', status: 409})
    await expect(withLibraryRestore(async () => {})).rejects.toMatchObject({code: 'library_restoring'})
    await runLibraryBackgroundTask(() => { events.push('unexpected worker') })
    work.resolve(); await task
    await new Promise(resolve => setImmediate(resolve))
    expect(events).toEqual(['work finished', 'restore started'])
    restore.resolve(); await restoring
    await runLibraryBackgroundTask(() => { events.push('worker resumed') })
    expect(events[events.length - 1]).toBe('worker resumed')
    expect(isLibraryRestoring()).toBe(false)
  })

  it('does not run restoration on drain timeout and releases the lock', async () => {
    const lease = beginLibraryOperation()
    let replaced = false
    try {
      await expect(withLibraryRestore(async () => { replaced = true }, 5)).rejects.toMatchObject({code: 'library_busy', status: 409})
      expect(replaced).toBe(false)
      expect(isLibraryRestoring()).toBe(false)
    } finally { lease.release() }
    await withLibraryRestore(async () => { replaced = true })
    expect(replaced).toBe(true)
  })

  it('keeps nested queued work in its operation context while draining', async () => {
    const queue = createConcurrencyQueue(1)
    const first = deferred(), second = deferred()
    const a = queue.enqueue(() => first.promise)
    const b = queue.enqueue(async () => { await second.promise; await runLibraryOperation(async () => {}) })
    let replaced = false
    const restoring = withLibraryRestore(async () => { replaced = true })
    first.resolve(); await a
    expect(replaced).toBe(false)
    second.resolve(); await b; await restoring
    expect(replaced).toBe(true)
  })

  it('unlocks after a restore failure, including asynchronous rollback work', async () => {
    const rollback = deferred()
    const restoring = withLibraryRestore(async () => { await rollback.promise; throw new Error('restore failed') })
    const rejected = expect(restoring).rejects.toThrow('restore failed')
    expect(isLibraryRestoring()).toBe(true)
    rollback.resolve(); await rejected
    await expect(runLibraryOperation(async () => 42)).resolves.toBe(42)
  })
})

it('prevents periodic workers from accessing the database during replacement', async () => {
  const {createCopyDiscoveryService} = await import('./mediaSources/copyDiscovery')
  const {createCopyDiscoveryAutomation} = await import('./mediaSources/copyDiscoveryAutomation')
  const {createCloudMetadataBackfill} = await import('./cloudAccounts/metadataBackfill')
  const {createNasMediaAssetsService} = await import('./nas/mediaAssets')
  const {createOriginalOperationsService} = await import('./originals/service')
  const {createSourceCatalogService} = await import('./mediaSources/catalogService')
  const db = {get sqlite() { throw new Error('Database is closed for restoration') }} as unknown as import('../types/db').ApiDb
  const discovery = createCopyDiscoveryService(db)
  const workers = [discovery, createCopyDiscoveryAutomation(db, discovery), createCloudMetadataBackfill(db), createNasMediaAssetsService(db), createOriginalOperationsService(db)]
  try {
    await withLibraryRestore(async () => {
      await Promise.all(workers.map(worker => worker.tick()))
      createSourceCatalogService(db).tick()
    })
  } finally { for (const worker of workers) worker.dispose() }
})


it('rejects late callbacks from a disconnected client after replacement', async () => {
  const request = beginLibraryOperation()
  request.release()
  await withLibraryRestore(async () => { assertLibraryOperationCurrent() })
  expect(() => request.run(() => assertLibraryOperationCurrent())).toThrow('library has changed')
  await expect(request.run(() => runLibraryOperation(async () => {}))).rejects.toMatchObject({status: 409})
  // A fresh request has the new generation and can use the library normally.
  await expect(runLibraryOperation(async () => assertLibraryOperationCurrent())).resolves.toBeUndefined()
})

it('rejects local trim and conversion before they read the library while restoring', async () => {
  const {startVideoTrim} = await import('./videoTrimService')
  const {startVideoConversion} = await import('./videoConversionService')
  const db = {} as import('../types/db').ApiDb
  await withLibraryRestore(async () => {
    expect(() => startVideoTrim(db, {id: 1, path: '/video.mp4', startSeconds: 0, endSeconds: 1})).toThrow('restoration is in progress')
    expect(() => startVideoConversion(db, [{id: 1, path: '/video.mp4'}], {codec: 'auto', resolution: 'original', quality: 'balanced', destination: '/tmp'})).toThrow('restoration is in progress')
  })
})
