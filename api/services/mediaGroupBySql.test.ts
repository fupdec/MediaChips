/**
 * @vitest-environment node
 */
import Database from 'better-sqlite3'
import {describe, expect, it} from 'vitest'
import {
  BITRATE_BUCKETS,
  FILESIZE_BUCKETS,
  VIEWS_BUCKETS,
  getGroupKeyAndLabel,
  type ItemsGroupBy,
} from '../../shared/itemsGroupBy'
import {
  buildMediaGroupKeySqlExpr,
  buildMediaGroupOrderSqlExpr,
  buildMediaGroupSummariesFromRows,
  supportsSqlMediaGroupBy,
} from './mediaGroupBySql'

type Fixture = {
  groupBy: ItemsGroupBy
  item: Record<string, unknown>
  columns?: Record<string, unknown>
}

const FIXTURES: Fixture[] = [
  {groupBy: 'rating', item: {rating: 0}},
  {groupBy: 'rating', item: {rating: 5}},
  {groupBy: 'favorite', item: {favorite: 1}},
  {groupBy: 'favorite', item: {favorite: 0}},
  {groupBy: 'ext', item: {ext: 'MP4'}},
  {groupBy: 'ext', item: {ext: ''}},
  {groupBy: 'ext', item: {ext: '.mkv'}},
  {groupBy: 'filesize', item: {filesize: 500}},
  {groupBy: 'filesize', item: {filesize: 5 * 1024 * 1024}},
  {groupBy: 'filesize', item: {filesize: 60 * 1024 * 1024 * 1024}},
  {groupBy: 'filesize', item: {filesize: -1}},
  {groupBy: 'duration', item: {duration: 30}, columns: {duration: 30}},
  {groupBy: 'duration', item: {duration: 900}, columns: {duration: 900}},
  {groupBy: 'duration', item: {duration: 40000}, columns: {duration: 40000}},
  {groupBy: 'views', item: {views: 0}},
  {groupBy: 'views', item: {views: 25}},
  {groupBy: 'views', item: {views: 2000}},
  {groupBy: 'codec', item: {codec: 'H264'}, columns: {codec: 'H264'}},
  {groupBy: 'codec', item: {codec: ''}, columns: {codec: ''}},
  {groupBy: 'fps', item: {fps: 24}, columns: {fps: 24}},
  {groupBy: 'fps', item: {fps: 23.976}, columns: {fps: 23.976}},
  {groupBy: 'fps', item: {fps: 0}, columns: {fps: 0}},
  {groupBy: 'bitrate', item: {bitrate: 500_000}, columns: {bitrate: 500_000}},
  {groupBy: 'bitrate', item: {bitrate: 12_000_000}, columns: {bitrate: 12_000_000}},
  {groupBy: 'resolution', item: {width: 1920, height: 1080}, columns: {width: 1920, height: 1080}},
  {groupBy: 'resolution', item: {width: 1080, height: 1920}, columns: {width: 1080, height: 1920}},
  {groupBy: 'resolution', item: {width: 640, height: 480}, columns: {width: 640, height: 480}},
  {groupBy: 'resolution', item: {width: 0, height: 0}, columns: {width: 0, height: 0}},
]

function evalGroupKeySql(groupBy: ItemsGroupBy, columns: Record<string, unknown>): string {
  const expr = buildMediaGroupKeySqlExpr(groupBy)
  expect(expr).toBeTruthy()

  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE media (
      id INTEGER PRIMARY KEY,
      rating INTEGER,
      favorite INTEGER,
      ext TEXT,
      filesize INTEGER,
      views INTEGER
    );
    CREATE TABLE videoMetadata (
      mediaId INTEGER PRIMARY KEY,
      duration REAL,
      bitrate INTEGER,
      codec TEXT,
      fps REAL,
      width INTEGER,
      height INTEGER
    );
    CREATE TABLE imageMetadata (
      mediaId INTEGER PRIMARY KEY,
      width INTEGER,
      height INTEGER
    );
  `)

  db.prepare(`
    INSERT INTO media (id, rating, favorite, ext, filesize, views)
    VALUES (1, @rating, @favorite, @ext, @filesize, @views)
  `).run({
    rating: columns.rating ?? null,
    favorite: columns.favorite ?? 0,
    ext: columns.ext ?? null,
    filesize: columns.filesize ?? null,
    views: columns.views ?? null,
  })

  db.prepare(`
    INSERT INTO videoMetadata (mediaId, duration, bitrate, codec, fps, width, height)
    VALUES (1, @duration, @bitrate, @codec, @fps, @width, @height)
  `).run({
    duration: columns.duration ?? null,
    bitrate: columns.bitrate ?? null,
    codec: columns.codec ?? null,
    fps: columns.fps ?? null,
    width: columns.width ?? null,
    height: columns.height ?? null,
  })

  db.prepare(`
    INSERT INTO imageMetadata (mediaId, width, height)
    VALUES (1, @width, @height)
  `).run({
    width: columns.width ?? null,
    height: columns.height ?? null,
  })

  const row = db.prepare(`SELECT ${expr} AS groupKey FROM media
    LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
    LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
    WHERE media.id = 1`).get() as {groupKey: string}

  db.close()
  return String(row.groupKey)
}

describe('mediaGroupBySql', () => {
  it('supports the expected column-backed modes', () => {
    expect(supportsSqlMediaGroupBy('rating')).toBe(true)
    expect(supportsSqlMediaGroupBy('path')).toBe(false)
    expect(supportsSqlMediaGroupBy('pinnedMeta')).toBe(false)
    expect(supportsSqlMediaGroupBy('dateMonth')).toBe(false)
  })

  it('matches shared JS group keys for fixtures', () => {
    for (const fixture of FIXTURES) {
      const jsKey = getGroupKeyAndLabel(fixture.item, fixture.groupBy, 'id').key
      const columns = {
        ...fixture.item,
        ...fixture.columns,
      }
      const sqlKey = evalGroupKeySql(fixture.groupBy, columns)
      expect(sqlKey, `${fixture.groupBy} item=${JSON.stringify(fixture.item)}`).toBe(jsKey)
    }
  })

  it('orders summary rows with compareGroupKeys parity', () => {
    const rows = [
      {groupKey: 'gte50gb', count: 1},
      {groupKey: 'lt1mb', count: 2},
      {groupKey: '#', count: 3},
      {groupKey: '1_10mb', count: 4},
    ]
    const summaries = buildMediaGroupSummariesFromRows(rows, 'filesize', 'filesize', 'asc')
    expect(summaries.map((entry) => entry.key)).toEqual([
      'lt1mb',
      '1_10mb',
      'gte50gb',
      '#',
    ])
    expect(FILESIZE_BUCKETS.length).toBeGreaterThan(3)
    expect(VIEWS_BUCKETS.length).toBeGreaterThan(3)
    expect(BITRATE_BUCKETS.length).toBeGreaterThan(3)
  })

  it('builds a stable ORDER BY fragment for bucket modes', () => {
    const expr = buildMediaGroupKeySqlExpr('duration')
    const order = buildMediaGroupOrderSqlExpr(expr!, 'duration', 'asc')
    expect(order).toContain("= '#' THEN 1")
    expect(order).toContain("'lt1m'")
    expect(order).toContain('ASC')
  })
})
