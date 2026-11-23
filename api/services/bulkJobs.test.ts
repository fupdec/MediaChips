/** @vitest-environment node */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {
  getBulkJob, resetBulkJobsForTests, resumeBulkJob, startBulkJob, stopBulkJob, waitForBulkJobForTests,
} from './bulkJobs'

beforeEach(resetBulkJobsForTests)

describe('bulk jobs', () => {
  it('processes unique ids in batches and records per-id results', async () => {
    const runChunk = vi.fn(async (ids: number[]) => ({done: ids.filter(id => id !== 3), failed: ids.filter(id => id === 3)}))
    const job = startBulkJob({kind: 'delete', ids: [1, 2, 3, 3, 4, 5], runChunk, batchSize: 2})
    await waitForBulkJobForTests(job.id)
    const result = getBulkJob(job.id)!
    expect(runChunk.mock.calls.map(([ids]) => ids)).toEqual([[1, 2], [3, 4], [5]])
    expect(result).toMatchObject({status: 'completed', total: 5, processed: 5, failedIds: [3], remaining: 0})
    expect(result.doneIds).toEqual([1, 2, 4, 5])
  })

  it('does not create a duplicate for an identical running job', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const runChunk = vi.fn(async (ids: number[]) => { await gate; return {done: ids} })
    const first = startBulkJob({kind: 'delete', ids: [1, 2], options: {a: 1}, runChunk})
    const second = startBulkJob({kind: 'delete', ids: [2, 1], options: {a: 1}, runChunk})
    expect(second.id).toBe(first.id)
    expect(startBulkJob({kind: 'delete', ids: [1, 2], options: {a: 2}, runChunk}).id).not.toBe(first.id)
    release()
    await waitForBulkJobForTests(first.id)
  })

  it('stops between batches and resumes the remainder', async () => {
    // eslint-disable-next-line prefer-const -- assigned after runChunk, which reads it lazily
    let job!: {id: string}
    const runChunk = vi.fn(async (ids: number[]) => {
      await Promise.resolve() // the job id is known once start returns
      if (ids[0] === 1) stopBulkJob(job.id)
      return {done: ids}
    })
    job = startBulkJob({kind: 'delete', ids: [1, 2, 3, 4], runChunk, batchSize: 2})
    await waitForBulkJobForTests(job.id)
    expect(getBulkJob(job.id)).toMatchObject({status: 'stopped', processed: 2, remaining: 2})
    resumeBulkJob(job.id)
    await waitForBulkJobForTests(job.id)
    expect(getBulkJob(job.id)).toMatchObject({status: 'completed', processed: 4, remaining: 0})
  })

  it('retries only failed ids and treats a throwing batch or unconfirmed ids as failed', async () => {
    let attempt = 0
    const runChunk = vi.fn(async (ids: number[]) => {
      attempt++
      if (attempt === 1) throw new Error('db locked')
      return {done: ids}
    })
    const job = startBulkJob({kind: 'delete', ids: [1, 2], runChunk})
    await waitForBulkJobForTests(job.id)
    expect(getBulkJob(job.id)).toMatchObject({failedIds: [1, 2], doneIds: []})
    resumeBulkJob(job.id)
    await waitForBulkJobForTests(job.id)
    expect(getBulkJob(job.id)).toMatchObject({status: 'completed', failedIds: [], doneIds: [1, 2]})
    expect(runChunk).toHaveBeenLastCalledWith([1, 2])
  })
})

it('omits id lists while active and exposes counters', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const job = startBulkJob({kind: 'x', ids: [1, 2], runChunk: async ids => { await gate; return {done: ids} }})
  expect(job).toMatchObject({doneIds: [], failedIds: [], status: 'running'})
  release()
  await waitForBulkJobForTests(job.id)
  expect(getBulkJob(job.id)).toMatchObject({doneIds: [1, 2], doneCount: 2, failedCount: 0})
  expect(getBulkJob(job.id, {withIds: false})).toMatchObject({doneIds: [], failedIds: [], doneCount: 2, status: 'completed'})
})
