/**
 * @vitest-environment node
 *
 * A5 profiling gates: 10k always; 50k/100k when MC_SCALE=1.
 */
import {afterEach, describe, expect, it} from 'vitest'
import {closeTestDb} from '../db/testUtils/createTestDb'
import {
  explainMediaListPage,
  hasBareTableScan,
  seedMediaFixture,
  timeMediaListPage,
  type SeedMediaFixtureResult,
} from '../db/testUtils/seedMediaFixture'
import {createMediaRepository} from '../db/repositories/media'

const runLarge = process.env.MC_SCALE === '1' || process.env.MC_SCALE === 'true'

/** Generous CI budgets — catch regressions, not microbench noise. */
const BUDGETS = {
  10_000: {page1Ms: 80, deepMs: 250, folderMs: 150},
  50_000: {page1Ms: 120, deepMs: 800, folderMs: 400},
  100_000: {page1Ms: 200, deepMs: 2_000, folderMs: 800},
} as const

function assertScale(count: keyof typeof BUDGETS, fixture: SeedMediaFixtureResult) {
  expect(fixture.count).toBe(count)

  const plan = explainMediaListPage(fixture.sqlite, fixture.mediaTypeId, 60, 0)
  expect(hasBareTableScan(plan, 'media')).toBe(false)
  expect(plan).toMatch(/media_media_type_id_id_idx|USING INDEX/i)

  const page1 = timeMediaListPage(fixture.sqlite, fixture.mediaTypeId, 1, 60)
  expect(page1.rowCount).toBe(60)
  expect(page1.ms).toBeLessThan(BUDGETS[count].page1Ms)

  const deep = timeMediaListPage(fixture.sqlite, fixture.mediaTypeId, 450, 60)
  expect(deep.offset).toBe(449 * 60)
  expect(deep.ms).toBeLessThan(BUDGETS[count].deepMs)

  const t0 = Date.now()
  const underFolder = createMediaRepository(fixture.drizzle)
    .findPathEntriesByMediaTypeIdsUnderFolder([fixture.mediaTypeId], '/fixture/media')
  const folderMs = Date.now() - t0
  expect(underFolder.length).toBe(count)
  expect(folderMs).toBeLessThan(BUDGETS[count].folderMs)
}

describe('media scale fixture (A5)', () => {
  const fixtures: SeedMediaFixtureResult[] = []

  afterEach(() => {
    while (fixtures.length) {
      const fixture = fixtures.pop()
      if (fixture) closeTestDb(fixture)
    }
  })

  it('seeds 10k and keeps list / folder hot paths indexed + bounded', () => {
    const fixture = seedMediaFixture({count: 10_000, pathPrefix: '/fixture/media'})
    fixtures.push(fixture)
    expect(fixture.seedMs).toBeLessThan(15_000)
    assertScale(10_000, fixture)
  })

  it.skipIf(!runLarge)('seeds 50k when MC_SCALE=1', () => {
    const fixture = seedMediaFixture({count: 50_000, pathPrefix: '/fixture/media'})
    fixtures.push(fixture)
    expect(fixture.seedMs).toBeLessThan(60_000)
    assertScale(50_000, fixture)
  })

  it.skipIf(!runLarge)('seeds 100k when MC_SCALE=1', () => {
    const fixture = seedMediaFixture({count: 100_000, pathPrefix: '/fixture/media'})
    fixtures.push(fixture)
    expect(fixture.seedMs).toBeLessThan(120_000)
    assertScale(100_000, fixture)
  })
})
