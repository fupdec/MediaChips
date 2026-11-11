// @vitest-environment node
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {mkdtemp, mkdir, rename, rm, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {createTestDb, closeTestDb, type TestDb} from '../db/testUtils/createTestDb'
import {createMediaRepository} from '../db/repositories/media'
import {computeOshashForPath} from './oshash'
import {applyMediaRelinks, inspectMediaRelink, previewMediaRootRelink} from './mediaRelink'
import {iterateMissingMediaSearch} from './missingMediaFinder'

let db: TestDb
let folder: string
const bytes = Buffer.alloc(160_000, 7)
beforeEach(async () => {
  db = createTestDb('relink')
  folder = await mkdtemp(path.join(os.tmpdir(), 'mediachips-relink-'))
})
afterEach(async () => {
  closeTestDb(db)
  await rm(folder, {recursive: true, force: true})
})
async function addOriginal(name = 'original.mp4', hashed = true) {
  const oldPath = path.join(folder, 'old', name)
  await mkdir(path.dirname(oldPath), {recursive: true})
  await writeFile(oldPath, bytes)
  const repo = createMediaRepository(db.drizzle)
  const row = repo.create({path: oldPath, name: 'Custom title', filesize: bytes.length})
  if (hashed) repo.updateById(row.id, {
    oshash: await computeOshashForPath(oldPath),
    contentHash: createHash('sha256').update(bytes).digest('hex'),
  })
  const newPath = path.join(folder, 'new', name)
  await mkdir(path.dirname(newPath), {recursive: true})
  return {id: row.id, oldPath, newPath}
}

describe('restoring original media links', () => {
  it('keeps the same card, chips, markers and playback time after a move', async () => {
    const input = await addOriginal()
    db.sqlite.prepare('INSERT INTO tagsInMedia (mediaId, tagId, metaId) VALUES (?, 10, 20)').run(input.id)
    db.sqlite.prepare("INSERT INTO marks (mediaId, type, time, end, tagId) VALUES (?, 'meta', 20, 40, 10)").run(input.id)
    db.sqlite.prepare('INSERT INTO videoMetadata (mediaId, time, duration) VALUES (?, 30, 60)').run(input.id)
    const original = createMediaRepository(db.drizzle).findById(input.id)!
    await rename(input.oldPath, input.newPath)
    expect((await inspectMediaRelink(db, input)).status).toBe('same')
    expect(await applyMediaRelinks(db, [input])).toEqual({updated: 1})
    expect(createMediaRepository(db.drizzle).findById(input.id)).toMatchObject({
      ...original, path: input.newPath, basename: 'original.mp4', ext: '.mp4',
    })
    expect(db.sqlite.prepare('SELECT * FROM tagsInMedia').all()).toEqual([{mediaId: input.id, tagId: 10, metaId: 20}])
    expect(db.sqlite.prepare('SELECT time, "end", tagId, mediaId FROM marks').all()).toEqual([{time: 20, end: 40, tagId: 10, mediaId: input.id}])
    expect(db.sqlite.prepare('SELECT time FROM videoMetadata').get()).toEqual({time: 30})
  })

  it('rejects different content even when the caller confirms the original', async () => {
    const input = await addOriginal()
    await rename(input.oldPath, input.newPath)
    await writeFile(input.newPath, Buffer.alloc(bytes.length, 11))
    db.sqlite.prepare("INSERT INTO marks (mediaId, type, time) VALUES (?, 'bookmark', 20)").run(input.id)
    expect((await inspectMediaRelink(db, input)).status).toBe('different')
    await expect(applyMediaRelinks(db, [{...input, confirmedOriginal: true}])).rejects.toMatchObject({status: 409})
    expect(createMediaRepository(db.drizzle).findById(input.id)?.path).toBe(input.oldPath)
    expect(db.sqlite.prepare('SELECT mediaId, time FROM marks').get()).toEqual({mediaId: input.id, time: 20})
  })

  it('keeps inherited folder chips on the moved card', async () => {
    const input = await addOriginal()
    const folderId = db.sqlite.prepare("INSERT INTO folderPaths (path, createdAt, updatedAt) VALUES (?, '2026-01-01', '2026-01-01')")
      .run(path.dirname(input.oldPath)).lastInsertRowid
    db.sqlite.prepare('INSERT INTO tagsInFolders (folderId, tagId, metaId) VALUES (?, 10, 20)').run(folderId)
    await rename(input.oldPath, input.newPath)
    await applyMediaRelinks(db, [input])
    expect(db.sqlite.prepare('SELECT * FROM tagsInMedia').all()).toEqual([{mediaId: input.id, tagId: 10, metaId: 20}])
  })

  it('compares full contents when both files exist, including changes outside oshash samples', async () => {
    const input = await addOriginal('original.mp4', false)
    const changed = Buffer.from(bytes)
    changed[80_000] = 9
    await writeFile(input.newPath, changed)
    expect(await computeOshashForPath(input.newPath)).toBe(await computeOshashForPath(input.oldPath))
    expect((await inspectMediaRelink(db, input)).status).toBe('different')
  })

  it('never treats sampled hash equality as proof when the original is missing', async () => {
    const input = await addOriginal()
    createMediaRepository(db.drizzle).updateById(input.id, {contentHash: null})
    const changed = Buffer.from(bytes)
    changed[80_000] = 9
    await rm(input.oldPath)
    await writeFile(input.newPath, changed)
    expect((await inspectMediaRelink(db, input)).status).toBe('unknown')
    await expect(applyMediaRelinks(db, [input])).rejects.toMatchObject({status: 409})
  })

  it('requires explicit confirmation when the old original and its fingerprint are unavailable', async () => {
    const input = await addOriginal('unhashed.mp4', false)
    await rename(input.oldPath, input.newPath)
    expect((await inspectMediaRelink(db, input)).status).toBe('unknown')
    await expect(applyMediaRelinks(db, [input])).rejects.toMatchObject({status: 409})
    expect(await applyMediaRelinks(db, [{...input, confirmedOriginal: true}])).toEqual({updated: 1})
    expect(createMediaRepository(db.drizzle).findById(input.id)?.contentHash).toBe(createHash('sha256').update(bytes).digest('hex'))
    const changed = Buffer.from(bytes)
    changed[80_000] = 9
    await writeFile(input.newPath, changed)
    expect((await inspectMediaRelink(db, {...input, oldPath: input.newPath})).status).toBe('different')
  })

  it('detects missing destinations and paths owned by another card', async () => {
    const input = await addOriginal()
    expect((await inspectMediaRelink(db, input)).status).toBe('missing')
    await writeFile(input.newPath, bytes)
    createMediaRepository(db.drizzle).create({path: input.newPath})
    expect((await inspectMediaRelink(db, input)).status).toBe('conflict')
    await expect(applyMediaRelinks(db, [input])).rejects.toMatchObject({status: 409})
  })

  it('rechecks the selected file on apply and commits no partial batch', async () => {
    const first = await addOriginal('first.mp4')
    const second = await addOriginal('second.mp4')
    await rename(first.oldPath, first.newPath)
    await rename(second.oldPath, second.newPath)
    expect((await inspectMediaRelink(db, second)).status).toBe('same')
    await writeFile(second.newPath, Buffer.from('another video'))
    await expect(applyMediaRelinks(db, [first, second])).rejects.toMatchObject({status: 409})
    expect(createMediaRepository(db.drizzle).findById(first.id)?.path).toBe(first.oldPath)
  })

  it('rejects stale cards and choosing the same file for two cards', async () => {
    const first = await addOriginal('first.mp4')
    const second = await addOriginal('second.mp4')
    await rename(first.oldPath, first.newPath)
    await expect(applyMediaRelinks(db, [first, {...second, newPath: first.newPath}])).rejects.toMatchObject({status: 409})
    await applyMediaRelinks(db, [first])
    await expect(applyMediaRelinks(db, [first])).rejects.toMatchObject({status: 409})
  })

  it('changes a directory prefix while preserving nested relative paths and excluding siblings', async () => {
    const input = await addOriginal('nested/clip.mp4')
    createMediaRepository(db.drizzle).create({path: path.join(folder, 'old-sibling', 'clip.mp4')})
    await rename(path.join(folder, 'old'), path.join(folder, 'moved'))
    const candidates = await previewMediaRootRelink(db, path.join(folder, 'old'), path.join(folder, 'moved'))
    expect(candidates).toEqual([{...input, newPath: path.join(folder, 'moved/nested/clip.mp4'), status: 'same'}])
    await applyMediaRelinks(db, candidates)
    expect(createMediaRepository(db.drizzle).findById(input.id)?.path).toBe(path.join(folder, 'moved/nested/clip.mp4'))
  })

  it('offers every matching path without selecting by filesystem traversal order', async () => {
    const input = await addOriginal()
    await rename(input.oldPath, input.newPath)
    const other = path.join(folder, 'new', 'copy.mp4')
    await writeFile(other, bytes)
    const events = []
    for await (const event of iterateMissingMediaSearch(db, {folders: [path.join(folder, 'new')]})) events.push(event)
    const complete = events.reverse().find((event) => event.type === 'complete')!
    expect(complete.matches).toHaveLength(1)
    expect(complete.matches?.[0]).toMatchObject({id: input.id, ambiguous: true, newPath: ''})
    expect(complete.matches?.[0].candidatePaths.sort()).toEqual([input.newPath, other].sort())
  })

  it('does not suggest an unrelated filename just because the file size matches', async () => {
    const input = await addOriginal('original.mp4', false)
    await rm(input.oldPath)
    await writeFile(path.join(folder, 'new', 'different.mp4'), bytes)
    const events = []
    for await (const event of iterateMissingMediaSearch(db, {folders: [path.join(folder, 'new')]})) events.push(event)
    expect(events.reverse().find((event) => event.type === 'complete')?.matches).toEqual([])
  })

  it('checks only active catalog paths in the requested original folder', async () => {
    const input = await addOriginal()
    await rename(input.oldPath, input.newPath)
    const repo = createMediaRepository(db.drizzle)
    repo.create({path: path.join(folder, 'old-sibling', 'original.mp4'), filesize: bytes.length})
    repo.create({path: path.join(folder, 'elsewhere', 'original.mp4'), filesize: bytes.length})
    const events = []
    for await (const event of iterateMissingMediaSearch(db, {
      originalFolder: path.join(folder, 'old'),
      folders: [path.join(folder, 'new')],
    })) events.push(event)
    expect(events.find(event => event.type === 'progress' && event.phase === 'loading_missing'))
      .toMatchObject({total: 1, processed: 1, missing: 1})
    expect(events.find(event => event.type === 'complete')).toMatchObject({
      missing: 1,
      matches: [{...input, ambiguous: false}],
    })
  })
})
