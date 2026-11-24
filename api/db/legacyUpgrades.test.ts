import Database from 'better-sqlite3'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {runLegacyUpgrades} from './legacyUpgrades'

const IMAGE_EXTENSIONS = 'jpg,jpeg,bmp,png,webp,gif,tiff,tif,heic,avif,svg'

let sqlite: Database.Database

function createSchema() {
  sqlite.exec(`
    CREATE TABLE media (
      id INTEGER PRIMARY KEY, path TEXT, basename TEXT, name TEXT, ext TEXT,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE mediaTypes (
      id INTEGER PRIMARY KEY, type TEXT, hidden INTEGER DEFAULT 0, extensions TEXT,
      custom INTEGER DEFAULT 0, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE metaInMediaTypes (
      id INTEGER PRIMARY KEY, metaId INTEGER, mediaTypeId INTEGER, "order" INTEGER, scraper TEXT, show INTEGER
    );
    CREATE TABLE settings (
      id INTEGER PRIMARY KEY, option TEXT, value TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE marks (id INTEGER PRIMARY KEY, type TEXT, icon TEXT);
    CREATE TABLE meta (id INTEGER PRIMARY KEY, name TEXT, type TEXT);
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, metaId INTEGER,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

const all = <T>(sql: string, ...params: unknown[]) => sqlite.prepare(sql).all(...params) as T[]
const one = <T>(sql: string, ...params: unknown[]) => sqlite.prepare(sql).get(...params) as T

beforeEach(() => {
  sqlite = new Database(':memory:')
  createSchema()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  sqlite.close()
  vi.restoreAllMocks()
})

describe('media names backfill', () => {
  it('fills missing basename, name and lower-cased extension from the path', () => {
    sqlite.exec(`
      INSERT INTO media (id, path) VALUES
        (1, '/lib/Holiday.Clip.MP4'),
        (2, 'C:\\\\Videos\\\\movie.mkv'),
        (3, '/lib/noext'),
        (4, '/lib/.hidden');
    `)
    runLegacyUpgrades(sqlite)
    expect(one('SELECT basename, name, ext FROM media WHERE id = 1')).toEqual({basename: 'Holiday.Clip.MP4', name: 'Holiday.Clip', ext: 'mp4'})
    expect(one('SELECT basename, name, ext FROM media WHERE id = 2')).toEqual({basename: 'movie.mkv', name: 'movie', ext: 'mkv'})
    expect(one('SELECT basename, name, ext FROM media WHERE id = 3')).toEqual({basename: 'noext', name: 'noext', ext: ''})
    expect(one('SELECT basename, name, ext FROM media WHERE id = 4')).toEqual({basename: '.hidden', name: '.hidden', ext: ''})
  })

  it('keeps values that are already present and only fills the gaps', () => {
    sqlite.exec(`INSERT INTO media (id, path, basename, name, ext) VALUES (1, '/lib/a.mp4', 'Custom.mp4', 'Custom', '')`)
    runLegacyUpgrades(sqlite)
    expect(one('SELECT basename, name, ext FROM media')).toEqual({basename: 'Custom.mp4', name: 'Custom', ext: 'mp4'})
  })

  it('leaves remote URLs and rows without a path alone', () => {
    sqlite.exec(`
      INSERT INTO media (id, path) VALUES (1, 'https://example.com/video.mp4'), (2, NULL);
    `)
    runLegacyUpgrades(sqlite)
    expect(all('SELECT basename, name, ext FROM media ORDER BY id')).toEqual([
      {basename: null, name: null, ext: null},
      {basename: null, name: null, ext: null},
    ])
  })
})

describe('image media type', () => {
  it('unhides the image type and widens the legacy extension list', () => {
    sqlite.exec(`INSERT INTO mediaTypes (id, type, hidden, extensions) VALUES (1, 'image', 1, 'jpg,jpeg,bmp,png')`)
    runLegacyUpgrades(sqlite)
    expect(one('SELECT hidden, extensions FROM mediaTypes')).toEqual({hidden: 0, extensions: IMAGE_EXTENSIONS})
  })

  it('does not touch a visible image type with extensions the user chose', () => {
    sqlite.exec(`INSERT INTO mediaTypes (id, type, hidden, extensions) VALUES (1, 'image', 0, 'jpg,png')`)
    runLegacyUpgrades(sqlite)
    expect(one('SELECT hidden, extensions FROM mediaTypes')).toEqual({hidden: 0, extensions: 'jpg,png'})
  })
})

describe('video meta assignments copied to images', () => {
  beforeEach(() => {
    sqlite.exec(`
      INSERT INTO mediaTypes (id, type, hidden, extensions) VALUES (1, 'video', 0, 'mp4'), (2, 'image', 0, 'jpg');
      INSERT INTO metaInMediaTypes (metaId, mediaTypeId, "order", scraper, show) VALUES
        (10, 1, 3, 'tpdb', 0),
        (11, 1, NULL, NULL, NULL);
    `)
  })

  it('copies missing assignments, defaulting order and visibility to 1', () => {
    runLegacyUpgrades(sqlite)
    expect(all('SELECT metaId, "order", scraper, show FROM metaInMediaTypes WHERE mediaTypeId = 2 ORDER BY metaId')).toEqual([
      {metaId: 10, order: 3, scraper: 'tpdb', show: 0},
      {metaId: 11, order: 1, scraper: null, show: 1},
    ])
  })

  it('does not overwrite or duplicate an assignment the image type already has', () => {
    sqlite.exec(`INSERT INTO metaInMediaTypes (metaId, mediaTypeId, "order", scraper, show) VALUES (10, 2, 9, 'mine', 1)`)
    runLegacyUpgrades(sqlite)
    runLegacyUpgrades(sqlite)
    expect(all('SELECT "order", scraper FROM metaInMediaTypes WHERE mediaTypeId = 2 AND metaId = 10')).toEqual([{order: 9, scraper: 'mine'}])
    expect(one<{n: number}>('SELECT COUNT(*) AS n FROM metaInMediaTypes WHERE mediaTypeId = 2').n).toBe(2)
  })

  it('does nothing when there is no image type', () => {
    sqlite.exec(`DELETE FROM mediaTypes WHERE type = 'image'`)
    expect(() => runLegacyUpgrades(sqlite)).not.toThrow()
    expect(one<{n: number}>('SELECT COUNT(*) AS n FROM metaInMediaTypes').n).toBe(2)
  })
})

describe('default media type dedupe', () => {
  it('keeps the oldest default row per type and never removes custom types', () => {
    sqlite.exec(`
      INSERT INTO mediaTypes (id, type, custom, extensions) VALUES
        (1, 'video', 0, 'mp4'), (2, 'video', 0, 'mp4'), (3, 'audio', 0, 'mp3'),
        (4, 'video', 1, 'mp4'), (5, 'video', 1, 'mp4');
    `)
    runLegacyUpgrades(sqlite)
    expect(all<{id: number}>('SELECT id FROM mediaTypes ORDER BY id').map((row) => row.id)).toEqual([1, 3, 4, 5])
  })
})

describe('card meta chips migration', () => {
  const OPTIONS = ['show_default_meta_filesize', 'show_default_meta_number_media', 'show_default_meta_number_views', 'show_default_meta_rating']

  beforeEach(() => {
    for (const option of OPTIONS) sqlite.prepare(`INSERT INTO settings (option, value) VALUES (?, '1')`).run(option)
  })

  it('turns off the three default chips once and leaves other settings alone', () => {
    runLegacyUpgrades(sqlite)
    const value = (option: string) => one<{value: string}>('SELECT value FROM settings WHERE option = ?', option).value
    expect(value('show_default_meta_filesize')).toBe('0')
    expect(value('show_default_meta_number_media')).toBe('0')
    expect(value('show_default_meta_number_views')).toBe('0')
    expect(value('show_default_meta_rating')).toBe('1')
    expect(value('migration.hide_card_default_meta_v1')).toBe('1')
  })

  it('respects the user turning a chip back on after the migration ran', () => {
    runLegacyUpgrades(sqlite)
    sqlite.prepare(`UPDATE settings SET value = '1' WHERE option = 'show_default_meta_filesize'`).run()
    runLegacyUpgrades(sqlite)
    expect(one<{value: string}>(`SELECT value FROM settings WHERE option = 'show_default_meta_filesize'`).value).toBe('1')
    expect(one<{n: number}>(`SELECT COUNT(*) AS n FROM settings WHERE option = 'migration.hide_card_default_meta_v1'`).n).toBe(1)
  })
})

describe('scene marks migration', () => {
  it('turns scene marks into bookmarks with the chapter icon and gives plain bookmarks an icon', () => {
    sqlite.exec(`
      INSERT INTO marks (id, type, icon) VALUES
        (1, 'scene', NULL), (2, 'Scene', 'old'), (3, 'bookmark', NULL), (4, 'bookmark', ''),
        (5, 'bookmark', 'star'), (6, NULL, NULL);
    `)
    runLegacyUpgrades(sqlite)
    expect(all('SELECT id, type, icon FROM marks ORDER BY id')).toEqual([
      {id: 1, type: 'bookmark', icon: 'movie-open-outline'},
      {id: 2, type: 'bookmark', icon: 'movie-open-outline'},
      {id: 3, type: 'bookmark', icon: 'bookmark'},
      {id: 4, type: 'bookmark', icon: 'bookmark'},
      {id: 5, type: 'bookmark', icon: 'star'},
      {id: 6, type: null, icon: null},
    ])
  })

  it('runs only once, so a new scene mark added later is left as it is', () => {
    runLegacyUpgrades(sqlite)
    sqlite.exec(`INSERT INTO marks (id, type, icon) VALUES (1, 'scene', NULL)`)
    runLegacyUpgrades(sqlite)
    expect(one('SELECT type FROM marks WHERE id = 1')).toEqual({type: 'scene'})
  })

  it('is skipped, without setting its flag, while marks has no icon column', () => {
    sqlite.exec(`DROP TABLE marks; CREATE TABLE marks (id INTEGER PRIMARY KEY, type TEXT); INSERT INTO marks (id, type) VALUES (1, 'scene')`)
    runLegacyUpgrades(sqlite)
    expect(one('SELECT type FROM marks')).toEqual({type: 'scene'})
    expect(one(`SELECT 1 AS ok FROM settings WHERE option = 'migration.scene_marks_to_bookmark_icon_v1'`)).toBeUndefined()
  })
})

describe('duplicate tag names', () => {
  it('renames duplicates and reports how many', () => {
    sqlite.exec(`
      INSERT INTO meta (id, name, type) VALUES (1, 'Tags', 'array'), (2, 'Performers', 'array');
      INSERT INTO tags (id, name, metaId) VALUES (10, 'Alice', 1), (11, 'alice', 2);
    `)
    runLegacyUpgrades(sqlite)
    const names = all<{name: string}>('SELECT name FROM tags ORDER BY id').map((row) => row.name)
    expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(2)
    expect(console.log).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Renamed 1 duplicate tag name'))
  })

  it('stays quiet when nothing needed renaming', () => {
    sqlite.exec(`INSERT INTO tags (id, name, metaId) VALUES (10, 'Alice', 1), (11, 'Bob', 1)`)
    runLegacyUpgrades(sqlite)
    expect(console.log).not.toHaveBeenCalled()
  })
})

describe('runLegacyUpgrades as a whole', () => {
  it('is idempotent', () => {
    sqlite.exec(`
      INSERT INTO media (id, path) VALUES (1, '/lib/a.mp4');
      INSERT INTO mediaTypes (id, type, hidden, extensions) VALUES (1, 'video', 0, 'mp4'), (2, 'image', 1, 'jpg,jpeg,bmp,png');
      INSERT INTO metaInMediaTypes (metaId, mediaTypeId, "order", show) VALUES (10, 1, 2, 1);
      INSERT INTO marks (id, type) VALUES (1, 'scene');
    `)
    runLegacyUpgrades(sqlite)
    const snapshot = JSON.stringify([
      all('SELECT * FROM media'), all('SELECT * FROM mediaTypes'),
      all('SELECT * FROM metaInMediaTypes'), all('SELECT * FROM marks'),
      all('SELECT option, value FROM settings ORDER BY option'),
    ])
    runLegacyUpgrades(sqlite)
    const again = JSON.stringify([
      all('SELECT * FROM media'), all('SELECT * FROM mediaTypes'),
      all('SELECT * FROM metaInMediaTypes'), all('SELECT * FROM marks'),
      all('SELECT option, value FROM settings ORDER BY option'),
    ])
    expect(again.replace(/"updatedAt":"[^"]*"/g, '')).toBe(snapshot.replace(/"updatedAt":"[^"]*"/g, ''))
  })
})
