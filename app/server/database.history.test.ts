// @vitest-environment node
import {afterEach, describe, expect, it, vi} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {setupDatabase} from './database'
import {closeActiveConnection} from '../../api/db/connectionHolder'
import {withChangeOperation} from '../../api/db/changeHistory'
import {listHistory} from '../../api/services/changeHistory'

vi.mock('../../api/services/legacyTimelineCleanup', () => ({scheduleLegacyTimelineCleanup: vi.fn()}))

describe('history installation on first database startup', () => {
  let root: string | undefined
  afterEach(() => {
    closeActiveConnection()
    if (root) fs.rmSync(root, {recursive: true, force: true})
  })
  it('captures fields added by migrations on the connection opened before bootstrap', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-history-startup-'))
    fs.mkdirSync(path.join(root, 'fresh'))
    const {db} = setupDatabase({databasesPath: root, dbConfig: {id: 'fresh', name: 'Fresh', active: true, createdAt: 1}})
    // setupDatabase installs tracking in the completed bootstrap callback.
    await Promise.resolve()
    db.sqlite.exec("INSERT INTO media (id,path,name,createdAt,updatedAt) VALUES (1,'/test.mp4','Test','2026','2026')")
    withChangeOperation('first-edit', () => db.sqlite.exec('UPDATE media SET rating=5 WHERE id=1'))
    expect(listHistory(db.sqlite, 50, 0).items).toEqual([expect.objectContaining({source: 'first-edit', fields: 1})])
    withChangeOperation('first-mark', () => db.sqlite.exec("INSERT INTO marks (mediaId,time,icon) VALUES (1,10,'star')"))
    expect(listHistory(db.sqlite, 50, 0).items[0]).toMatchObject({source: 'first-mark', fields: 1})
  })
})
