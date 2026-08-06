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
  getItemDiskRoot,
  getItemFirstLetterKey,
  getItemParentPath,
  type ItemsGroupBy,
} from '../../shared/itemsGroupBy'
import {registerMediaGroupByFunctions} from '../db/mediaGroupByFunctions'
import {
  buildMediaGroupBySqlPlan,
  buildMediaGroupKeySqlExpr,
  buildMediaGroupOrderSqlExpr,
  buildMediaGroupSummariesFromRows,
  supportsSqlMediaGroupBy,
} from './mediaGroupBySql'

type Fixture = {
  groupBy: ItemsGroupBy
  item: Record<string, unknown>
  columns?: Record<string, unknown>
  sortBy?: unknown
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
  {groupBy: 'dateDay', item: {createdAt: '2024-06-15T12:00:00.000Z'}},
  {groupBy: 'dateDay', item: {createdAt: '2024-06-15T22:30:00.000Z'}},
  {groupBy: 'dateDay', item: {createdAt: null}},
  {groupBy: 'dateMonth', item: {createdAt: '2024-01-01T00:00:00.000Z'}},
  {groupBy: 'dateYear', item: {createdAt: '2023-12-31T23:30:00.000Z'}},
  {
    groupBy: 'dateDay',
    item: {viewedAt: '2024-06-15T22:30:00.000Z'},
    sortBy: 'viewedAt',
  },
  {groupBy: 'path', item: {path: '/Movies/Action/a.mp4'}},
  {groupBy: 'path', item: {path: 'C:\\Videos\\clip.mp4'}},
  {groupBy: 'path', item: {path: 'solo.mp4'}},
  {groupBy: 'diskRoot', item: {path: 'D:\\Library\\a.mp4'}},
  {groupBy: 'diskRoot', item: {path: '/Volumes/Disk/a.mp4'}},
  {groupBy: 'diskRoot', item: {path: '/Users/me/a.mp4'}},
  {groupBy: 'firstLetter', item: {name: 'alpha'}},
  {groupBy: 'firstLetter', item: {name: '  beta'}},
  {groupBy: 'firstLetter', item: {name: '9lives'}},
  {groupBy: 'firstLetter', item: {name: ''}},
]

function evalGroupKeySql(
  groupBy: ItemsGroupBy,
  columns: Record<string, unknown>,
  sortBy: unknown = 'id',
): string {
  const expr = buildMediaGroupKeySqlExpr(groupBy, sortBy)
  expect(expr).toBeTruthy()

  const db = new Database(':memory:')
  registerMediaGroupByFunctions(db)
  db.exec(`
    CREATE TABLE media (
      id INTEGER PRIMARY KEY,
      name TEXT,
      path TEXT,
      rating INTEGER,
      favorite INTEGER,
      ext TEXT,
      filesize INTEGER,
      views INTEGER,
      createdAt TEXT,
      updatedAt TEXT,
      viewedAt TEXT
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
    INSERT INTO media (id, name, path, rating, favorite, ext, filesize, views, createdAt, updatedAt, viewedAt)
    VALUES (1, @name, @path, @rating, @favorite, @ext, @filesize, @views, @createdAt, @updatedAt, @viewedAt)
  `).run({
    name: columns.name ?? null,
    path: columns.path ?? null,
    rating: columns.rating ?? null,
    favorite: columns.favorite ?? 0,
    ext: columns.ext ?? null,
    filesize: columns.filesize ?? null,
    views: columns.views ?? null,
    createdAt: columns.createdAt ?? null,
    updatedAt: columns.updatedAt ?? null,
    viewedAt: columns.viewedAt ?? null,
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
  it('supports column, UDF, and pinnedMeta modes', () => {
    expect(supportsSqlMediaGroupBy('rating')).toBe(true)
    expect(supportsSqlMediaGroupBy('dateDay')).toBe(true)
    expect(supportsSqlMediaGroupBy('path')).toBe(true)
    expect(supportsSqlMediaGroupBy('diskRoot')).toBe(true)
    expect(supportsSqlMediaGroupBy('firstLetter')).toBe(true)
    expect(supportsSqlMediaGroupBy('pinnedMeta')).toBe(false)
    expect(supportsSqlMediaGroupBy('pinnedMeta', {metaId: 3, metaType: 'string'})).toBe(true)
    expect(supportsSqlMediaGroupBy('pinnedMeta', {metaId: 3, metaType: 'array'})).toBe(false)
    expect(supportsSqlMediaGroupBy('pinnedMeta', {
      metaId: 3,
      metaType: 'array',
      mediaTypeId: 1,
    })).toBe(true)
  })

  it('matches shared JS group keys for fixtures', () => {
    for (const fixture of FIXTURES) {
      const sortBy = fixture.sortBy ?? 'id'
      const jsKey = getGroupKeyAndLabel(fixture.item, fixture.groupBy, sortBy).key
      const columns = {
        ...fixture.item,
        ...fixture.columns,
      }
      const sqlKey = evalGroupKeySql(fixture.groupBy, columns, sortBy)
      expect(sqlKey, `${fixture.groupBy} item=${JSON.stringify(fixture.item)}`).toBe(jsKey)
    }
  })

  it('UDF helpers match shared path/letter helpers directly', () => {
    expect(getItemParentPath('/a/b/c.mp4')).toBe('/a/b')
    expect(getItemDiskRoot('E:\\x\\y.mp4')).toBe('E:\\')
    expect(getItemFirstLetterKey('zeta')).toBe('Z')
  })

  it('builds pinnedMeta value plan with valuesInMedia join', () => {
    const plan = buildMediaGroupBySqlPlan('pinnedMeta', 'id', {
      metaId: 9,
      metaType: 'string',
    })
    expect(plan).toBeTruthy()
    expect(plan!.joinSql).toContain('valuesInMedia')
    expect(plan!.replacements).toEqual({groupMetaId: 9})
  })

  it('builds pinnedMeta tag plan with folder inheritance union', () => {
    const plan = buildMediaGroupBySqlPlan('pinnedMeta', 'id', {
      metaId: 7,
      metaType: 'array',
      mediaTypeId: 1,
    })
    expect(plan).toBeTruthy()
    expect(plan!.joinSql).toContain('tagsInMedia')
    expect(plan!.joinSql).toContain('tagsInFolders')
    expect(plan!.labelExpr).toContain('groupLabel')
    expect(plan!.replacements).toMatchObject({groupMetaId: 7, mediaTypeId: 1})
  })

  it('evaluates pinnedMeta value keys via SQL plan', () => {
    const plan = buildMediaGroupBySqlPlan('pinnedMeta', 'id', {
      metaId: 4,
      metaType: 'number',
    })
    expect(plan).toBeTruthy()

    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE media (id INTEGER PRIMARY KEY, mediaTypeId INTEGER);
      CREATE TABLE valuesInMedia (
        mediaId INTEGER,
        metaId INTEGER,
        value TEXT
      );
    `)
    db.prepare('INSERT INTO media (id, mediaTypeId) VALUES (1, 1), (2, 1)').run()
    db.prepare(`
      INSERT INTO valuesInMedia (mediaId, metaId, value) VALUES
        (1, 4, '12'),
        (2, 4, '')
    `).run()

    const rows = db.prepare(`
      SELECT media.id, ${plan!.groupKeyExpr} AS groupKey
      FROM media
      ${plan!.joinSql}
      ORDER BY media.id
    `).all({groupMetaId: 4}) as Array<{id: number; groupKey: string}>

    expect(rows).toEqual([
      {id: 1, groupKey: '12'},
      {id: 2, groupKey: '#'},
    ])
    db.close()
  })

  it('evaluates pinnedMeta tag primary key with folder inheritance', () => {
    const plan = buildMediaGroupBySqlPlan('pinnedMeta', 'id', {
      metaId: 5,
      metaType: 'array',
      mediaTypeId: 1,
    })
    expect(plan).toBeTruthy()

    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE media (id INTEGER PRIMARY KEY, mediaTypeId INTEGER, path TEXT);
      CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE tagsInMedia (mediaId INTEGER, tagId INTEGER, metaId INTEGER);
      CREATE TABLE folderPaths (id INTEGER PRIMARY KEY, path TEXT);
      CREATE TABLE tagsInFolders (folderId INTEGER, tagId INTEGER, metaId INTEGER);
    `)
    db.prepare(`
      INSERT INTO media (id, mediaTypeId, path) VALUES
        (1, 1, '/Movies/Action/a.mp4'),
        (2, 1, '/Movies/Drama/b.mp4'),
        (3, 1, '/Other/c.mp4')
    `).run()
    db.prepare(`
      INSERT INTO tags (id, name) VALUES
        (10, 'Zebra'),
        (11, 'Alpha'),
        (12, 'FolderTag')
    `).run()
    db.prepare(`
      INSERT INTO tagsInMedia (mediaId, tagId, metaId) VALUES
        (1, 10, 5),
        (1, 11, 5)
    `).run()
    db.prepare(`INSERT INTO folderPaths (id, path) VALUES (1, '/Movies')`).run()
    db.prepare(`
      INSERT INTO tagsInFolders (folderId, tagId, metaId) VALUES (1, 12, 5)
    `).run()

    const rows = db.prepare(`
      SELECT media.id,
        ${plan!.groupKeyExpr} AS groupKey,
        ${plan!.labelExpr} AS groupLabel
      FROM media
      ${plan!.joinSql}
      ORDER BY media.id
    `).all({groupMetaId: 5, mediaTypeId: 1}) as Array<{
      id: number
      groupKey: string
      groupLabel: string
    }>

    // Primary tag is Alpha (name-sorted), not Zebra.
    expect(rows[0]).toMatchObject({id: 1, groupKey: '11', groupLabel: 'Alpha'})
    // Inherited folder tag only.
    expect(rows[1]).toMatchObject({id: 2, groupKey: '12', groupLabel: 'FolderTag'})
    expect(rows[2]).toMatchObject({id: 3, groupKey: '#', groupLabel: '#'})
    db.close()
  })

  it('orders date summary rows chronologically with # last', () => {
    const rows = [
      {groupKey: '2024-06', count: 1},
      {groupKey: '#', count: 2},
      {groupKey: '2023-12', count: 3},
      {groupKey: '2024-01', count: 4},
    ]
    const summaries = buildMediaGroupSummariesFromRows(rows, 'dateMonth', 'createdAt', 'asc')
    expect(summaries.map((entry) => entry.key)).toEqual([
      '2023-12',
      '2024-01',
      '2024-06',
      '#',
    ])
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

  it('orders pinnedMeta tags by label expression', () => {
    const plan = buildMediaGroupBySqlPlan('pinnedMeta', 'id', {
      metaId: 1,
      metaType: 'array',
      mediaTypeId: 1,
    })
    const order = buildMediaGroupOrderSqlExpr(
      plan!.groupKeyExpr,
      'pinnedMeta',
      'asc',
      {labelExpr: plan!.labelExpr, metaType: 'array'},
    )
    expect(order).toContain('COLLATE NOCASE')
    expect(order).toContain('groupLabel')
  })
})
