// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../db/testUtils/createTestDb'
import {createMediaRepository} from '../db/repositories/media'
import {createSettingsRepository} from '../db/repositories/settings'
import type {ApiDb} from '../types/db'
import {DUPLICATE_POLICY_SETTING, defaultDuplicatePolicy} from '../../shared/duplicateSimilarity'
import {listMediaDuplicateGroups} from './mediaDuplicateGroups'
import {mergeMediaItems} from './mediaMerge'
import {listMediaCopies, selectPlayableCopy, setPreferredCopy, attachLocalMediaCopy} from './mediaSources/copies'
import {computeOshashForPath} from './oshash'
import {createCopyDiscoveryService} from './mediaSources/copyDiscovery'

describe('similarity search and merging', () => {
  let fixture: TestDb, db: ApiDb, directory: string
  beforeEach(() => {
    fixture = createTestDb('similarity'); db = {...fixture}
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-similarity-'))
    fixture.sqlite.exec("INSERT INTO mediaTypes (id,type,name,createdAt,updatedAt) VALUES (1,'video','Videos','2026','2026')")
  })
  afterEach(() => { closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true}) })
  async function card(name: string, bytes = 'matching media bytes') {
    const filename = path.join(directory, name); fs.writeFileSync(filename, bytes)
    const row = createMediaRepository(db.drizzle).create({path: filename, name, basename: name, mediaTypeId: 1, filesize: Buffer.byteLength(bytes)})
    fixture.sqlite.prepare('UPDATE media SET oshash = ? WHERE id = ?').run(await computeOshashForPath(filename), row.id)
    return row
  }
  function visuals() {
    const policy = defaultDuplicatePolicy()
    policy.weights = {path: 0, name: 0, size: 0, oshash: 0, visual: 100}
    policy.threshold = 90
    createSettingsRepository(db.drizzle).upsertByOption(DUPLICATE_POLICY_SETTING, JSON.stringify(policy))
    fixture.sqlite.exec("UPDATE media SET visualHash = '1234567890abcdef'")
  }
  it('uses saved rules and preserves all identical copies in one entry', async () => {
    const a = await card('a.mp4'), b = await card('b.mp4')
    const result = listMediaDuplicateGroups(db, {duplicatesBy: 'similarity', mediaTypeId: 1})
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]).toMatchObject({originalId: a.id, itemIds: [a.id, b.id], similarity: [{score: 100}]})
    await mergeMediaItems(db, {survivorId: a.id, sourceIds: [b.id], similarity: true})
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM media').get()).toEqual({n: 1})
    expect(listMediaCopies(db, a.id).copies.map(copy => copy.relationship)).toEqual(['copy', 'copy'])
    expect(fs.existsSync(a.path) && fs.existsSync(b.path)).toBe(true)
  })
  it('retains different versions with per-file fingerprints and supports playing a selected version', async () => {
    const a = await card('a.mp4'), b = await card('b.mp4', 'a different encoded version of the movie')
    visuals()
    await mergeMediaItems(db, {survivorId: a.id, sourceIds: [b.id], similarity: true})
    const versions = listMediaCopies(db, a.id).copies
    const variant = versions.find(copy => copy.path === b.path)!
    expect(variant.relationship).toBe('version')
    expect(versions.find(copy => copy.path === a.path)?.relationship).toBe('copy')
    setPreferredCopy(db, a.id, variant.id)
    const playback = await selectPlayableCopy(db, a.id, new AbortController().signal)
    expect(playback.url).toContain(variant.id)
    expect(fs.existsSync(b.path)).toBe(true)
  })
  it('keeps version provenance when attaching and discovering later exact copies', async () => {
    const a = await card('a.mp4', 'original movie bytes'), b = await card('b.mp4', 'different movie data')
    visuals()
    await mergeMediaItems(db, {survivorId: a.id, sourceIds: [b.id], similarity: true})
    const added = path.join(directory, 'b-copy.mp4'); fs.copyFileSync(b.path, added)
    await attachLocalMediaCopy(db, a.id, added, new AbortController().signal)
    expect(listMediaCopies(db, a.id).copies.find(copy => copy.path === added)?.relationship).toBe('version')
    createSettingsRepository(db.drizzle).upsertByOption('copyVerificationSha256', '1')
    const discovered = path.join(directory, 'discovered.mp4'); fs.copyFileSync(b.path, discovered)
    const worker = createCopyDiscoveryService(db)
    try {
      const job = worker.create({roots: [{key: discovered}]})
      await worker.tick()
      expect(worker.job(job.id).counts.attached).toBe(1)
      expect(listMediaCopies(db, a.id).copies.find(copy => copy.path === discovered)?.relationship).toBe('version')
    } finally { worker.dispose() }
  })
  it('refreshes stale oshash evidence before merging and makes no changes on failure', async () => {
    const a = await card('a.mp4'), b = await card('b.mp4')
    fs.writeFileSync(b.path, 'different file bytes')
    await expect(mergeMediaItems(db, {survivorId: a.id, sourceIds: [b.id], similarity: true})).rejects.toThrow('similarity_threshold_not_met')
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM media').get()).toEqual({n: 2})
    expect(listMediaCopies(db, a.id).copies).toHaveLength(1)
  })
  it('requires confirmation for deletion and retains the primary file', async () => {
    const a = await card('a.mp4'), b = await card('b.mp4')
    await expect(mergeMediaItems(db, {survivorId: a.id, sourceIds: [b.id], similarity: true, deleteSourceIds: [b.id]})).rejects.toThrow('confirmation')
    expect(fs.existsSync(b.path)).toBe(true)
    await mergeMediaItems(db, {survivorId: a.id, sourceIds: [b.id], similarity: true, deleteSourceIds: [b.id], confirmFileDeletion: true})
    expect(fs.existsSync(a.path)).toBe(true)
    expect(fs.existsSync(b.path)).toBe(false)
    expect(listMediaCopies(db, a.id).copies.map(copy => copy.path)).toEqual([a.path])
  })
  it('combines full SHA verification with configured fingerprint evidence', async () => {
    const a = await card('a.mp4'), b = await card('b.mp4')
    createSettingsRepository(db.drizzle).upsertByOption('copyVerificationSha256', '1')
    await mergeMediaItems(db, {survivorId: a.id, sourceIds: [b.id], similarity: true})
    expect(listMediaCopies(db, a.id).copies.every(copy => copy.verificationMethod === 'sha256')).toBe(true)
  })
  it('honours an empty selection and does not include trashed entries', async () => {
    await card('a.mp4'); const b = await card('b.mp4')
    expect(listMediaDuplicateGroups(db, {duplicatesBy: 'similarity', mediaIds: []}).groups).toEqual([])
    fixture.sqlite.prepare("UPDATE media SET deletedAt = '2026' WHERE id = ?").run(b.id)
    expect(listMediaDuplicateGroups(db, {duplicatesBy: 'similarity'}).groups).toEqual([])
  })
})
