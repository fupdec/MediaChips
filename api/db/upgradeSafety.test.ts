import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import {expect, it} from 'vitest'
import {projectPath} from '../../shared/projectRoot'
import {bootstrapDatabase} from './migrationRunner'
import {createLibraryBackup, stageLibraryBackup} from '../services/libraryBackup'
import {installChangeHistory, withChangeOperation} from './changeHistory'

it('upgrades tagged 1.12.0 data and preserves identity and metadata across restart, backup and relocation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-upgrade-'))
  const file = path.join(root, 'db.sqlite')
  let db = new Database(file)
  const tables = ['media', 'tags', 'tagsInMedia', 'marks', 'playlists', 'mediaInPlaylists']
  const read = () => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()]))
  try {
    db.exec(fs.readFileSync(projectPath('api/db/testUtils/fixtures/v1.12.0.sql'), 'utf8'))
    db.exec(`INSERT INTO media(id,path,name,rating,createdAt,updatedAt) VALUES
      (42,'/Медиа/фильм.mp4','Моя карточка',5,'2026','2026'),
      (43,'gdrive://remote-file','Облако',4,'2026','2026');
      INSERT INTO media(id,path,basename,ext,name,createdAt,updatedAt) VALUES(44,'/legacy/noextension','noextension','','Своё название','2026','2026');
      INSERT INTO tags(id,name,createdAt,updatedAt) VALUES(71,'Избранное','2026','2026');
      INSERT INTO tagsInMedia(mediaId,tagId,metaId) VALUES(42,71,7);
      INSERT INTO marks(id,mediaId,time,end,text) VALUES(91,42,12500,15000,'Сцена');
      INSERT INTO playlists(id,name,createdAt,updatedAt) VALUES(81,'Плейлист','2026','2026');
      INSERT INTO mediaInPlaylists(mediaId,playlistId,"order") VALUES(42,81,3);`)
    const before = read()
    db.close()
    await bootstrapDatabase(file)
    db = new Database(file)
    for (const table of tables) {
      const rows = read()[table] as Record<string, unknown>[]
      for (const expected of before[table] as Record<string, unknown>[]) {
        const preserved = {...expected}
        if (table === 'media' && expected.id === 42) {
          delete preserved.basename; delete preserved.ext; delete preserved.updatedAt
        }
        expect(rows).toContainEqual(expect.objectContaining(preserved))
      }
    }
    const location = db.prepare('SELECT * FROM mediaLocations WHERE mediaId=43').get()
    expect(location).toBeTruthy()
    installChangeHistory(db)
    withChangeOperation('upgrade-test', () => db.exec('UPDATE media SET rating=3 WHERE id=42'))
    db.exec(`INSERT INTO verifiedMediaCopies(id,mediaId,path,version,sha256,size,contentType,verifiedAt)
      VALUES('copy',42,'/Другой компьютер/фильм.mp4','v','hash',100,'video/mp4','now');
      INSERT INTO mediaCopyPreferences(mediaId,copyId) VALUES(42,'copy');
      INSERT INTO copyDiscoveryJobs(id,state,method,roots,createdAt,updatedAt) VALUES('job','paused','sha256','[]','now','now');`)
    const snapshotTables = [...tables, 'mediaLocations', 'sourceConnections', 'verifiedMediaCopies', 'mediaCopyPreferences', 'changeHistory', 'copyDiscoveryJobs']
    const snapshot = () => Object.fromEntries(snapshotTables.map(t => [t, db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all()]))
    const upgraded = snapshot()
    const archive = path.join(root, 'upgrade.zip')
    await createLibraryBackup(db, root, archive)
    const restored = await stageLibraryBackup(archive, root)
    const moved = path.join(restored, 'db.sqlite')
    db.close()
    await bootstrapDatabase(moved)
    await bootstrapDatabase(moved)
    db = new Database(moved)
    expect(snapshot()).toEqual(upgraded)
    expect(db.pragma('integrity_check', {simple: true})).toBe('ok')
    expect(db.pragma('foreign_key_check')).toEqual([])
  } finally {
    if (db.open) db.close()
    fs.rmSync(root, {recursive: true, force: true})
  }
})

it('refuses a future schema before applying migrations or repairs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-future-schema-'))
  const file = path.join(root, 'db.sqlite')
  const db = new Database(file)
  try {
    db.exec("CREATE TABLE __drizzle_migrations(hash TEXT, created_at NUMERIC); INSERT INTO __drizzle_migrations VALUES('future',9999999999999)")
    await expect(bootstrapDatabase(file)).rejects.toThrow('newer than this application')
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([{name: '__drizzle_migrations'}])
  } finally { db.close(); fs.rmSync(root, {recursive: true, force: true}) }
})
