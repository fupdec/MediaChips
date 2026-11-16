/**
 * @vitest-environment node
 *
 * Asserts list hot-path queries use indexes (no bare SCAN of media / videoMetadata).
 * Deep OFFSET for infinite jump stays LIMIT/OFFSET by design (no keyset this epic);
 * page-1 filter/sort is the done-when target.
 */
import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../db/testUtils/createTestDb'
import {MEDIA_NOT_IN_TRASH_SQL} from '../../shared/mediaTrash'

function explainPlan(db: TestDb, sql: string): string {
  const rows = db.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Array<{detail?: string}>
  return rows.map((row) => String(row.detail || '')).join('\n')
}

/** SQLite may say "SCAN table USING INDEX …" — that still uses an index. Bare SCAN is the failure. */
function hasBareTableScan(plan: string, table: string): boolean {
  const re = new RegExp(`\\bSCAN\\s+(?:TABLE\\s+)?${table}\\b(?!\\s+USING\\s+INDEX)`, 'i')
  return re.test(plan)
}

describe('media list path EXPLAIN QUERY PLAN', () => {
  let db: TestDb

  beforeEach(() => {
    db = createTestDb('list-path-explain')
    const now = '2020-01-01T00:00:00.000Z'
    db.sqlite.prepare(`
      INSERT INTO mediaTypes (id, type, name, icon, createdAt, updatedAt)
      VALUES (1, 'video', 'Video', 'video', ?, ?)
    `).run(now, now)

    const insertMedia = db.sqlite.prepare(`
      INSERT INTO media (
        id, path, basename, name, ext, filesize, mediaTypeId, rating, favorite,
        views, createdAt, updatedAt, mediaCreatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, 0, ?, ?, ?)
    `)
    const insertMeta = db.sqlite.prepare(`
      INSERT INTO videoMetadata (mediaId, duration, width, height, bitrate, fps)
      VALUES (?, ?, 1920, 1080, 1000, 30)
    `)

    const tx = db.sqlite.transaction(() => {
      for (let i = 1; i <= 500; i += 1) {
        const name = `clip-${String(i).padStart(4, '0')}`
        insertMedia.run(
          i,
          `/media/${name}.mp4`,
          `${name}.mp4`,
          name,
          'mp4',
          1000 + i,
          now,
          now,
          now,
        )
        insertMeta.run(i, 60 + (i % 120))
      }
    })
    tx()
  })

  afterEach(() => {
    closeTestDb(db)
  })

  it('uses an index for default id DESC page-1 list', () => {
    const plan = explainPlan(db, `
      SELECT media.id
      FROM media
      WHERE media.mediaTypeId = 1
        AND ${MEDIA_NOT_IN_TRASH_SQL}
      ORDER BY media.id DESC
      LIMIT 60 OFFSET 0
    `)
    expect(hasBareTableScan(plan, 'media')).toBe(false)
    expect(plan).toMatch(/media_media_type_id_id_idx|USING INDEX/i)
  })

  it('uses an index for name / path sorts', () => {
    const namePlan = explainPlan(db, `
      SELECT media.id
      FROM media
      WHERE media.mediaTypeId = 1
        AND ${MEDIA_NOT_IN_TRASH_SQL}
      ORDER BY media.name ASC
      LIMIT 60 OFFSET 0
    `)
    expect(hasBareTableScan(namePlan, 'media')).toBe(false)
    expect(namePlan).toMatch(/media_media_type_id_name_idx|USING INDEX/i)

    const pathPlan = explainPlan(db, `
      SELECT media.id
      FROM media
      WHERE media.mediaTypeId = 1
        AND ${MEDIA_NOT_IN_TRASH_SQL}
      ORDER BY media.path ASC
      LIMIT 60 OFFSET 0
    `)
    expect(hasBareTableScan(pathPlan, 'media')).toBe(false)
    expect(pathPlan).toMatch(/media_media_type_id_path_idx|USING INDEX/i)
  })

  it('uses duration index when sorting by videoMetadata.duration', () => {
    const plan = explainPlan(db, `
      SELECT media.id
      FROM media
      LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
      WHERE media.mediaTypeId = 1
        AND ${MEDIA_NOT_IN_TRASH_SQL}
      ORDER BY videoMetadata.duration DESC
      LIMIT 60 OFFSET 0
    `)
    expect(hasBareTableScan(plan, 'videoMetadata')).toBe(false)
    expect(plan).toMatch(/video_metadata_duration_idx|USING INDEX/i)
  })

  it('documents deep OFFSET remains O(offset) (no keyset)', () => {
    const shallow = explainPlan(db, `
      SELECT media.id
      FROM media
      WHERE media.mediaTypeId = 1
        AND ${MEDIA_NOT_IN_TRASH_SQL}
      ORDER BY media.id DESC
      LIMIT 180 OFFSET 0
    `)
    const deep = explainPlan(db, `
      SELECT media.id
      FROM media
      WHERE media.mediaTypeId = 1
        AND ${MEDIA_NOT_IN_TRASH_SQL}
      ORDER BY media.id DESC
      LIMIT 180 OFFSET 450
    `)
    // Same index access; SQLite still walks OFFSET rows — keyset deferred on purpose.
    expect(hasBareTableScan(shallow, 'media')).toBe(false)
    expect(hasBareTableScan(deep, 'media')).toBe(false)
    expect(deep).toMatch(/media_media_type_id_id_idx|USING INDEX/i)
  })
})
