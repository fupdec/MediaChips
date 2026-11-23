/**
 * @vitest-environment node
 *
 * Measurements for bulk selection and bulk delete at 1k / 10k / 100k files.
 * Run: MC_SCALE_BULK=1 npx vitest run api/services/bulkSelectionScale.test.ts
 * Prints a table; budgets are generous regression guards, not performance promises.
 */
import {afterEach, describe, expect, it} from 'vitest'
import {closeTestDb} from '../db/testUtils/createTestDb'
import {seedMediaFixture, type SeedMediaFixtureResult} from '../db/testUtils/seedMediaFixture'
import {getMediaSelectionStats} from './mediaSelectionStats'
import {softDeleteMediaMany} from './mediaTrash'
import {getBulkJob, resetBulkJobsForTests, startBulkJob, waitForBulkJobForTests} from './bulkJobs'
import type {ApiDb} from '../types/db'

const enabled = process.env.MC_SCALE_BULK === '1'
const SIZES = [1_000, 10_000, 100_000]
const rows: Record<string, number | string>[] = []

const ms = (t0: number) => Math.round((performance.now() - t0) * 10) / 10

describe.skipIf(!enabled)('bulk selection and delete at scale', () => {
  const fixtures: SeedMediaFixtureResult[] = []
  afterEach(() => {
    while (fixtures.length) closeTestDb(fixtures.pop()!)
    resetBulkJobsForTests()
  })

  for (const count of SIZES) {
    it(`${count} files`, async () => {
      const fixture = seedMediaFixture({count, pathPrefix: '/fixture/media'})
      fixtures.push(fixture)
      const db = fixture as unknown as ApiDb
      const ids = (fixture.sqlite.prepare('SELECT id FROM media ORDER BY id').all() as {id: number}[]).map(r => r.id)

      // Browser-side cost of the explicit ID list: membership checks via includes().
      let t0 = performance.now()
      let hits = 0
      for (let i = 0; i < 200; i++) if (ids.includes(ids[(i * 7919) % ids.length])) hits++
      const includesMs = ms(t0) / 200

      // Server stats: chunks of 5000 as the client sends them.
      t0 = performance.now()
      let stats = {count: 0, filesize: 0}
      for (let o = 0; o < ids.length; o += 5000) {
        const part = getMediaSelectionStats(db, ids.slice(o, o + 5000))
        stats = {count: stats.count + part.count, filesize: stats.filesize + part.filesize}
      }
      const statsMs = ms(t0)
      expect(stats.count).toBe(count)

      // Job overhead with a trivial runner (pure orchestration cost).
      t0 = performance.now()
      const idle = startBulkJob({kind: 'idle', ids, runChunk: async chunk => ({done: chunk})})
      await waitForBulkJobForTests(idle.id)
      const jobMs = ms(t0)
      expect(getBulkJob(idle.id)!.doneCount).toBe(count)

      // Real delete to Trash through the job, batches of 500.
      const heap0 = process.memoryUsage().heapUsed
      t0 = performance.now()
      const job = startBulkJob({
        kind: 'delete', ids, batchSize: 500,
        runChunk: async chunk => ({done: softDeleteMediaMany(db, chunk).deletedIds}),
      })
      await waitForBulkJobForTests(job.id)
      const deleteMs = ms(t0)
      const heapMb = Math.round((process.memoryUsage().heapUsed - heap0) / 1e6)
      const final = getBulkJob(job.id)!
      expect(final).toMatchObject({status: 'completed', doneCount: count, failedCount: 0})

      // Payload the browser receives when the job ends (id lists of the result).
      const payloadKb = Math.round(JSON.stringify(final).length / 1024)

      rows.push({files: count, includesMsEach: includesMs, statsMs, idleJobMs: jobMs, deleteJobMs: deleteMs, heapDeltaMb: heapMb, finalPayloadKb: payloadKb})
      expect(hits).toBe(200)
      expect(statsMs).toBeLessThan(2_000)
      expect(deleteMs).toBeLessThan(60_000)
    }, 180_000)
  }

  it('prints the table', () => {
    console.table(rows)
  })
})
