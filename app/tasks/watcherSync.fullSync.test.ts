/**
 * @vitest-environment node
 *
 * Real-folder fullSync smoke (A5 watcher reliability).
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {closeTestDb, createTestDb, type TestDb} from '../../api/db/testUtils/createTestDb'
import {mediaTypes} from '../../api/db/schema/mediaTypes'
import {runMediaBulkLiteImport} from '../../api/services/mediaBulkLiteImport'
import {WatcherSyncEngine} from './watcherSync'

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

describe('WatcherSyncEngine fullSync integration', () => {
  let db: TestDb
  let tmpDir = ''
  let mediaTypeId = 0

  beforeEach(() => {
    db = createTestDb('watcher-fullsync')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-watcher-fullsync-'))
    const now = new Date().toISOString()
    const row = db.drizzle.insert(mediaTypes).values({
      name: 'Images',
      type: 'image',
      extensions: 'jpg,jpeg,png',
      order: 1,
      createdAt: now,
      updatedAt: now,
    }).returning().get()
    mediaTypeId = row.id
  })

  afterEach(() => {
    closeTestDb(db)
    fs.rmSync(tmpDir, {recursive: true, force: true})
  })

  function writeJpg(name: string): string {
    const filePath = path.join(tmpDir, name)
    fs.writeFileSync(filePath, TINY_JPEG)
    return filePath
  }

  it('reports new files then stays quiet after import; marks true deletions lost', async () => {
    writeJpg('a.jpg')
    writeJpg('b.jpg')
    writeJpg('c.jpg')

    const engine = new WatcherSyncEngine({
      drizzle: db.drizzle,
      sqlite: db.sqlite,
    })
    const folders = [{
      path: tmpDir,
      types: [{id: mediaTypeId, extensions: 'jpg'}],
    }]

    const beforeImport = await engine.fullSync(folders)
    expect(db.sqlite.prepare('SELECT reasons FROM copyDiscoveryAutoRequests').all()).toEqual([{reasons: JSON.stringify(['folder_update'])}])
    expect(beforeImport).toHaveLength(1)
    expect(beforeImport[0].files[0].newTotal).toBe(3)
    expect(beforeImport[0].files[0].lostTotal).toBe(0)

    const imported = await runMediaBulkLiteImport(db.drizzle, {
      mediaType: {id: mediaTypeId, type: 'image', extensions: 'jpg'},
      roots: [tmpDir],
    })
    expect(imported.inserted).toBe(3)

    const afterImport = await engine.fullSync(folders)
    expect(afterImport[0].files[0].newTotal).toBe(0)
    expect(afterImport[0].files[0].lostTotal).toBe(0)

    const extra = writeJpg('d.jpg')
    const withNew = await engine.fullSync(folders)
    expect(withNew[0].files[0].newTotal).toBe(1)
    expect(withNew[0].files[0].new).toContain(extra)

    fs.rmSync(path.join(tmpDir, 'a.jpg'), {force: true})
    const afterDelete = await engine.fullSync(folders)
    // d.jpg still new (not imported); a.jpg lost from DB perspective.
    expect(afterDelete[0].files[0].newTotal).toBe(1)
    expect(afterDelete[0].files[0].lostTotal).toBe(1)
  })
})
