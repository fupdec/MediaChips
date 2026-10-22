// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {Readable} from 'node:stream'
import {expect, it} from 'vitest'
import {createTestDb, closeTestDb} from '../../db/testUtils/createTestDb'
import {createNasService} from './service'
import {createNasCredentialStore} from './credentials'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import type {NasTransport} from './transport'

it('retains NAS card identity, chips and marks after disconnect and credentials recovery on another host', async () => {
  const fixture = createTestDb('nas-recovery')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nas-recovery-'))
  const db = {...fixture, path: directory}
  const config = {name: 'NAS', protocol: 'sftp' as const, host: 'nas.example', port: 22, username: 'reader', root: '/videos', password: 'test-only'}
  const connect = async (): Promise<NasTransport> => ({
    async list() { return [] }, async stat() { return {size: 36, modifiedAt: 1000, isDirectory: false} },
    async read(_key, start, end) { return Readable.from([Buffer.alloc(36, 1).subarray(start, end + 1)]) }, close() {},
  })
  try {
    createMediaTypesRepository(db.drizzle).create({name: 'video', type: 'video'})
    const service = createNasService({connect, credentials: createNasCredentialStore(path.join(directory, 'host-one'))})
    const connection = await service.saveConnection(db, config)
    const item = await service.importFile(db, connection.id, 'Кино/фильм.mp4')
    db.sqlite.prepare('UPDATE media SET name=?,rating=5 WHERE id=?').run('Моё название', item.id)
    db.sqlite.prepare('INSERT INTO marks(mediaId,time,text) VALUES(?,12345,?)').run(item.id, 'Сцена')
    db.sqlite.exec("INSERT INTO tags(id,name,createdAt,updatedAt) VALUES(77,'Чип','now','now')")
    db.sqlite.prepare('INSERT INTO tagsInMedia(mediaId,tagId,metaId) VALUES(?,77,1)').run(item.id)
    const snapshot = () => ['media', 'mediaLocations', 'marks', 'tagsInMedia'].map(t => db.sqlite.prepare(`SELECT * FROM "${t}"`).all())
    service.disconnect(db, connection.id)
    const before = snapshot()
    const other = createNasService({connect, credentials: createNasCredentialStore(path.join(directory, 'host-two'))})
    expect(other.connections(db)[0].hasCredentials).toBe(false)
    expect(snapshot()).toEqual(before)
    await other.saveConnection(db, config, connection.id)
    expect((await other.importFile(db, connection.id, 'Кино/фильм.mp4')).id).toBe(item.id)
    expect(db.sqlite.prepare('SELECT name,rating FROM media WHERE id=?').get(item.id)).toEqual({name: 'Моё название', rating: 5})
    expect(db.sqlite.prepare('SELECT mediaId,time,text FROM marks').all()).toEqual([{mediaId: item.id, time: 12345, text: 'Сцена'}])
    expect(db.sqlite.prepare('SELECT mediaId,tagId FROM tagsInMedia').all()).toEqual([{mediaId: item.id, tagId: 77}])
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM mediaLocations').get()).toEqual({n: 1})
  } finally { closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true}) }
})
