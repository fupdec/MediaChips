// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import {Readable} from 'stream'
import {createHash} from 'crypto'
import express from 'express'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createSettingsRepository} from '../../db/repositories/settings'
import {COPY_SHA256_SETTING} from '../../../shared/copyVerification'
import {createMediaRepository} from '../../db/repositories/media'
import type {ApiDb} from '../../types/db'
import {mergeMediaItems} from '../mediaMerge'
import {copyCandidates, listMediaCopies, setPreferredCopy, selectPlayableCopy, verifyCopiesForMerge, hashCopy,
  attachLocalMediaCopy, detachMediaCopy, UNVERIFIED_COPY_VERSION, TRUSTED_COPY_VERSION, type OpenCopySource} from './copies'
import {updateVerifiedCopyPath} from './copyPathUpdates'
import {createLocalOriginalAdapter} from './localAdapter'
import {mediaCopiesRouter} from '../../routes/MediaCopies.routes'
import {READ_SOURCE_CAPABILITIES} from '../../../shared/mediaSources'
import {CATALOG_SOURCE_TOKENS_SQL, CATALOG_AVAILABILITY_SQL, markCatalogSourceDisconnected} from '../mediaCatalogSources'

describe('verified file copies', () => {
  let fixture: TestDb
  let db: ApiDb
  let directory: string
  beforeEach(() => {
    fixture = createTestDb('verified-copies')
    db = {...fixture}
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-copies-'))
    fixture.sqlite.exec(`INSERT INTO mediaTypes (id, type, name, createdAt, updatedAt) VALUES (1, 'video', 'Videos', '2026', '2026');
      INSERT INTO meta (id, type, name, createdAt, updatedAt) VALUES (1, 'array', 'Tags', '2026', '2026');
      INSERT INTO tags (id, metaId, name, createdAt, updatedAt) VALUES (1, 1, 'Shared chip', '2026', '2026');`)
  })
  afterEach(() => { closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true}) })
  const local = (name: string, bytes = 'same movie bytes') => {
    const filename = path.join(directory, name)
    fs.writeFileSync(filename, bytes)
    return createMediaRepository(db.drizzle).create({path: filename, name, mediaTypeId: 1, filesize: bytes.length})
  }
  const signal = () => new AbortController().signal
  const strict = (enabled: boolean) => createSettingsRepository(db.drizzle).upsertByOption(COPY_SHA256_SETTING, enabled ? '1' : '0')
  const merge = (a: number, b: number) => mergeMediaItems(db, {survivorId: a, sourceIds: [b]})

  it('keeps local files and chips under one stable card, including repeated merges', async () => {
    const a = local('nas-mounted.mp4'), b = local('local.mp4'), c = local('backup.mp4')
    fixture.sqlite.prepare('INSERT INTO tagsInMedia (mediaId, metaId, tagId) VALUES (?, 1, 1)').run(b.id)
    const result = await merge(a.id, b.id)
    expect(result.survivor.id).toBe(a.id)
    expect(result.deletedIds).toEqual([b.id])
    expect(fs.existsSync(b.path)).toBe(true)
    expect(listMediaCopies(db, a.id).copies).toHaveLength(2)
    const preferred = copyCandidates(db, a.id).find(copy => copy.path === b.path)!
    setPreferredCopy(db, a.id, preferred.id)
    await merge(a.id, c.id)
    expect(listMediaCopies(db, a.id)).toMatchObject({preferredId: preferred.id, copies: expect.any(Array)})
    expect(copyCandidates(db, a.id)).toHaveLength(3)
    const repo = createMediaRepository(db.drizzle)
    expect(repo.findByPathVariants([b.path])?.id).toBe(a.id)
    expect(repo.findOrCreateByPath(b.path, {mediaTypeId: 1})).toMatchObject({created: false, row: {id: a.id}})
    expect(repo.bulkCreateLite([{path: c.path, mediaTypeId: 1}])).toEqual([])
    expect(fixture.sqlite.prepare('SELECT mediaId, metaId, tagId FROM tagsInMedia').all()).toEqual([{mediaId: a.id, metaId: 1, tagId: 1}])
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM media').get()).toEqual({n: 1})
  })

  it('defaults to oshash and accepts matching ends even when middle bytes differ', async () => {
    const original = Buffer.alloc(320000, 7)
    const alternative = Buffer.from(original)
    alternative.fill(99, 65536, alternative.length - 65536)
    const a = local('large-original.mp4'), b = local('large-copy.mp4')
    fs.writeFileSync(a.path, original); fs.writeFileSync(b.path, alternative)
    await merge(a.id, b.id)
    const copies = copyCandidates(db, a.id)
    expect(copies).toHaveLength(2)
    expect(copies.every(copy => copy.verificationMethod === 'oshash' && copy.stored?.sha256 === '' && copy.stored?.oshash)).toBe(true)
    expect(copies[0].stored?.oshash).toBe(copies[1].stored?.oshash)
    expect(fs.readFileSync(a.path).equals(fs.readFileSync(b.path))).toBe(false)
  })

  it('persists the SHA-256 setting and requires a complete match only when enabled', async () => {
    const bytes = Buffer.alloc(320000, 7)
    const a = local('large-original.mp4'), b = local('large-edit.mp4')
    fs.writeFileSync(a.path, bytes)
    bytes.fill(99, 65536, bytes.length - 65536)
    fs.writeFileSync(b.path, bytes)
    strict(true)
    expect(createSettingsRepository(db.drizzle).findByOption(COPY_SHA256_SETTING)?.value).toBe('1')
    await expect(merge(a.id, b.id)).rejects.toMatchObject({code: 'copy_content_mismatch'})
    expect(copyCandidates(db, a.id)).toHaveLength(1)
    strict(false)
    await merge(a.id, b.id)
    expect(copyCandidates(db, a.id).every(copy => copy.verificationMethod === 'oshash')).toBe(true)
  })

  it('records full SHA-256 evidence for identical copies when explicitly enabled', async () => {
    strict(true)
    const a = local('a.mp4'), b = local('b.mp4')
    await merge(a.id, b.id)
    const expected = createHash('sha256').update(fs.readFileSync(a.path)).digest('hex')
    expect(copyCandidates(db, a.id).every(copy => copy.verificationMethod === 'sha256' && copy.stored?.sha256 === expected)).toBe(true)
  })

  it('adds a local copy with oshash by default, and rejects a changed middle in full mode', async () => {
    const bytes = Buffer.alloc(320000, 7)
    const a = local('source.mp4')
    const added = path.join(directory, 'existing-copy.mp4')
    fs.writeFileSync(a.path, bytes)
    bytes.fill(99, 65536, bytes.length - 65536)
    fs.writeFileSync(added, bytes)
    strict(true)
    await expect(attachLocalMediaCopy(db, a.id, added, signal())).rejects.toMatchObject({code: 'copy_content_mismatch'})
    strict(false)
    expect((await attachLocalMediaCopy(db, a.id, added, signal())).copies.every(copy => copy.verificationMethod === 'oshash')).toBe(true)
  })

  it('uses only ranges for large remote merges, attachment and changed-version playback by default', async () => {
    const size = 50 * 1024 ** 3
    const a = createMediaRepository(db.drizzle).create({path: 'gdrive://large-original', filesize: size, mediaTypeId: 1})
    let version = 'v1'
    const reads: Array<string | undefined> = []
    const open: OpenCopySource = async (_db, key) => ({key, adapter: {provider: key.startsWith('/') ? 'local' : 'gdrive',
      capabilities: READ_SOURCE_CAPABILITIES, list: async () => ({entries: []}), close() {},
      stat: async () => ({resourceKey: key, name: 'large.mp4', size, version, isDirectory: false, contentType: 'video/mp4'}),
      read: async (_key, range) => {
        reads.push(range)
        if (!range) throw new Error('Full file download is forbidden')
        const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(range)!
        return {status: 206, headers: {'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(Number(end) - Number(start) + 1)},
          body: Buffer.alloc(Number(end) - Number(start) + 1)}
      },
    }})
    const added = await attachLocalMediaCopy(db, a.id, '/virtual/large-copy.mp4', signal(), open)
    expect(added.copies).toHaveLength(2)
    expect(reads).toHaveLength(4)
    expect(reads).not.toContain(undefined)
    reads.length = 0
    const verification = await verifyCopiesForMerge(db, [a.id], signal(), open)
    expect(verification.copies.every(copy => copy.verificationMethod === 'oshash' && copy.sha256 === '')).toBe(true)
    expect(reads).toHaveLength(4)
    reads.length = 0
    version = 'v2'
    expect((await selectPlayableCopy(db, a.id, signal(), open)).url).toContain('copies/stream')
    expect(reads).not.toContain(undefined)
    expect(reads).toContain('bytes=0-65535')
    expect(reads).toContain(`bytes=${size - 65536}-${size - 1}`)
  })

  it('with trust and a missing local file, re-uses the stored fingerprint of a remote copy instead of re-reading it', async () => {
    strict(false)
    const size = 5 * 1024 ** 3
    const a = createMediaRepository(db.drizzle).create({path: '/Volumes/unplugged/movie.mp4', filesize: size, oshash: 'abc', mediaTypeId: 1})
    const insert = fixture.sqlite.prepare(`INSERT INTO verifiedMediaCopies
      (id, mediaId, path, relationship, version, sha256, oshash, verificationMethod, size, contentType, availability, verifiedAt)
      VALUES (?, ?, ?, 'copy', ?, '', 'abc', 'oshash', ?, 'video/mp4', ?, '2026')`)
    insert.run('local', a.id, a.path, UNVERIFIED_COPY_VERSION, size, 'unavailable')
    insert.run('remote', a.id, 'gdrive://file-1', `${size}:v1`, size, 'available')
    let version = `${size}:v1`
    const reads: Array<string | undefined> = []
    const open: OpenCopySource = async (_db, key) => ({key, adapter: {provider: key.startsWith('/') ? 'local' : 'gdrive',
      capabilities: READ_SOURCE_CAPABILITIES, list: async () => ({entries: []}), close() {},
      stat: async () => {
        if (key.startsWith('/')) throw Object.assign(new Error('missing'), {code: 'ENOENT'})
        return {resourceKey: key, name: 'movie.mp4', size, version, isDirectory: false, contentType: 'video/mp4'}
      },
      read: async (_key, range) => {
        reads.push(range)
        const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(range || '')!
        return {status: 206, headers: {'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(Number(end) - Number(start) + 1)},
          body: Buffer.alloc(Number(end) - Number(start) + 1)}
      },
    }})
    const trusted = await verifyCopiesForMerge(db, [a.id], signal(), open, 'oshash', false, [a.id], true)
    expect(reads).toHaveLength(0)
    expect(trusted.copies.find(copy => copy.path === 'gdrive://file-1')).toMatchObject({oshash: 'abc', availability: 'available', verificationMethod: 'oshash'})
    // Without the option the remote file is read as before; so is a copy whose version changed.
    await expect(verifyCopiesForMerge(db, [a.id], signal(), open, 'oshash', false, [a.id], false)).rejects.toBeDefined()
    expect(reads.length).toBeGreaterThan(0)
    reads.length = 0
    version = `${size}:v2`
    await verifyCopiesForMerge(db, [a.id], signal(), open, 'oshash', false, [a.id], true).catch(() => undefined)
    expect(reads.length).toBeGreaterThan(0)
  })

  it('with trust and a missing local file, uses the catalog oshash of a Drive card that has no stored copies yet', async () => {
    strict(false)
    const size = 3 * 1024 ** 3
    const repo = createMediaRepository(db.drizzle)
    const drive = repo.create({path: 'gdrive://file-2', filesize: size, oshash: 'abc', mediaTypeId: 1})
    const gone = repo.create({path: '/Volumes/unplugged/other.mp4', filesize: size, oshash: 'abc', mediaTypeId: 1})
    fixture.sqlite.exec("UPDATE media SET oshash = 'abc'")
    let driveSize = size
    const reads: Array<string | undefined> = []
    const open: OpenCopySource = async (_db, key) => ({key, adapter: {provider: key.startsWith('/') ? 'local' : 'gdrive',
      capabilities: READ_SOURCE_CAPABILITIES, list: async () => ({entries: []}), close() {},
      stat: async () => {
        if (key.startsWith('/')) throw Object.assign(new Error('missing'), {code: 'ENOENT'})
        return {resourceKey: key, name: 'movie.mp4', size: driveSize, version: `${driveSize}:2021`, isDirectory: false, contentType: 'video/mp4'}
      },
      read: async (_key, range) => {
        reads.push(range)
        const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(range || '')!
        return {status: 206, headers: {'content-range': `bytes ${start}-${end}/${driveSize}`, 'content-length': String(Number(end) - Number(start) + 1)},
          body: Buffer.alloc(Number(end) - Number(start) + 1)}
      },
    }})
    const verification = await verifyCopiesForMerge(db, [drive.id, gone.id], signal(), open, 'oshash', true, [drive.id, gone.id], true)
    expect(reads).toHaveLength(0)
    expect(verification.reused).toBe(1)
    expect(verification.copies.find(copy => copy.path === 'gdrive://file-2')).toMatchObject({oshash: 'abc', size, availability: 'available'})
    // A different size on Drive means the catalog fingerprint no longer describes the file: it is read normally.
    driveSize = size + 1
    await verifyCopiesForMerge(db, [drive.id, gone.id], signal(), open, 'oshash', true, [drive.id, gone.id], true).catch(() => undefined)
    expect(reads.length).toBeGreaterThan(0)
  })

  it('never upgrades a growing tiny file to a full large download in fast mode', async () => {
    const a = createMediaRepository(db.drizzle).create({path: 'gdrive://growing', mediaTypeId: 1, filesize: 4})
    const read = vi.fn(async () => { throw new Error('Must not read the full file') })
    let statCalls = 0
    const open: OpenCopySource = async (_db, key) => ({key, adapter: {provider: 'gdrive', capabilities: READ_SOURCE_CAPABILITIES,
      close() {}, list: async () => ({entries: []}), read,
      stat: async () => ({resourceKey: key, name: 'movie.mp4', size: ++statCalls === 1 ? 4 : 50 * 1024 ** 3,
        version: `v${statCalls}`, isDirectory: false, contentType: 'video/mp4'}),
    }})
    await expect(verifyCopiesForMerge(db, [a.id], signal(), open)).rejects.toMatchObject({code: 'source_version_changed'})
    expect(read).not.toHaveBeenCalled()
  })

  it('rejects same-size alternate edits atomically even when sampled fingerprints agree', async () => {
    const a = local('original.mp4', 'one edit'), b = local('director.mp4', 'two edit')
    fixture.sqlite.exec("UPDATE media SET contentHash = 'same-sampled-hash', oshash = 'same-oshash', visualHash = 'same-visual-hash'")
    fixture.sqlite.prepare('INSERT INTO tagsInMedia (mediaId, metaId, tagId) VALUES (?, 1, 1)').run(b.id)
    const before = fixture.sqlite.prepare('SELECT * FROM media ORDER BY id').all()
    await expect(merge(a.id, b.id)).rejects.toMatchObject({code: 'copy_content_mismatch'})
    expect(fixture.sqlite.prepare('SELECT * FROM media ORDER BY id').all()).toEqual(before)
    expect(fixture.sqlite.prepare('SELECT mediaId FROM tagsInMedia').all()).toEqual([{mediaId: b.id}])
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM verifiedMediaCopies').get()).toEqual({n: 0})
    await expect(mergeMediaItems(db, {survivorId: a.id, sourceIds: [b.id], withFile: true})).rejects.toThrow('preserves all files')
    expect(fs.existsSync(b.path)).toBe(true)
  })

  it('uses the preference, falls back on failure, and refuses a changed montage', async () => {
    const a = local('a.mp4'), b = local('b.mp4')
    await merge(a.id, b.id)
    const copies = copyCandidates(db, a.id)
    const preferred = copies.find(copy => copy.path === b.path)!
    setPreferredCopy(db, a.id, preferred.id)
    expect((await selectPlayableCopy(db, a.id, signal())).url).toContain(preferred.id)
    fs.writeFileSync(b.path, 'different movie!')
    const plan = await selectPlayableCopy(db, a.id, signal())
    expect(plan.url).toContain(copies.find(copy => copy.path === a.path)!.id)
    expect(copyCandidates(db, a.id).find(copy => copy.id === preferred.id)?.availability).toBe('unavailable')
    // A version change with identical bytes can be verified again.
    fs.writeFileSync(b.path, 'same movie bytes')
    expect((await selectPlayableCopy(db, a.id, signal())).url).toContain(preferred.id)
    fs.unlinkSync(a.path); fs.unlinkSync(b.path)
    await expect(selectPlayableCopy(db, a.id, signal())).rejects.toMatchObject({code: 'no_available_copy'})
  })

  it('falls back when stat succeeds but reading the preferred copy is denied', async () => {
    const a = local('readable.mp4'), b = local('denied.mp4')
    await merge(a.id, b.id)
    const preferred = copyCandidates(db, a.id).find(copy => copy.path === b.path)!
    setPreferredCopy(db, a.id, preferred.id)
    const open: OpenCopySource = async (_db, filename) => {
      const adapter = createLocalOriginalAdapter()
      if (filename === b.path) adapter.read = async () => { throw new Error('permission denied') }
      return {adapter, key: filename}
    }
    const plan = await selectPlayableCopy(db, a.id, signal(), open)
    expect(plan.url).toContain(copyCandidates(db, a.id).find(copy => copy.path === a.path)!.id)
    expect(copyCandidates(db, a.id).find(copy => copy.id === preferred.id)?.availability).toBe('unavailable')
  })

  it('adds a local copy only after comparison, detaches without deleting files, protects the last copy', async () => {
    const a = local('original.mp4')
    const added = path.join(directory, 'copy.mp4')
    fs.copyFileSync(a.path, added)
    const result = await attachLocalMediaCopy(db, a.id, added, signal())
    expect(result.copies).toHaveLength(2)
    const copy = result.copies.find(copy => copy.path === added)!
    setPreferredCopy(db, a.id, copy.id)
    expect(detachMediaCopy(db, a.id, copy.id)).toMatchObject({preferredId: null})
    expect(fs.existsSync(added)).toBe(true)
    const remaining = copyCandidates(db, a.id)
    expect(remaining).toHaveLength(1)
    expect(() => detachMediaCopy(db, a.id, remaining[0].id)).toThrow('last_copy')
    fs.writeFileSync(added, 'an alternate edit')
    await expect(attachLocalMediaCopy(db, a.id, added, signal())).rejects.toMatchObject({code: 'copy_content_mismatch'})
    expect(copyCandidates(db, a.id)).toHaveLength(1)
  })

  it('promotes a retained address when the original is detached and preserves verification across moves', async () => {
    const a = local('original.mp4'), b = local('backup.mp4')
    await merge(a.id, b.id)
    const original = copyCandidates(db, a.id).find(copy => copy.path === a.path)!
    detachMediaCopy(db, a.id, original.id)
    expect(createMediaRepository(db.drizzle).findById(a.id)?.path).toBe(b.path)
    expect(fs.existsSync(a.path)).toBe(true)
    const next = path.join(directory, 'moved.mp4')
    fs.renameSync(b.path, next)
    updateVerifiedCopyPath(db, a.id, b.path, next)
    createMediaRepository(db.drizzle).updateById(a.id, {path: next})
    expect((await selectPlayableCopy(db, a.id, signal())).url).toContain(copyCandidates(db, a.id)[0].id)
    fs.writeFileSync(next, 'an alternate cut')
    await expect(selectPlayableCopy(db, a.id, signal())).rejects.toMatchObject({code: 'no_available_copy'})
  })

  it('hashes NAS, Drive and local copies with common adapters and retains source classification', async () => {
    const a = local('local.mp4', 'data')
    const repo = createMediaRepository(db.drizzle)
    const nas = '11111111-1111-4111-8111-111111111111'
    const b = repo.create({path: `nas://${nas}/movie.mp4`, mediaTypeId: 1})
    const c = repo.create({path: 'gdrive://movie', mediaTypeId: 1})
    fixture.sqlite.prepare('INSERT INTO sourceConnections (id, config, credentialRef, createdAt, provider) VALUES (?, ?, ?, ?, ?)').run(nas, '{}', 'secret', '2026', 'nas')
    fixture.sqlite.exec("INSERT INTO sourceConnections VALUES ('google-drive', '{}', 'drive', '2026', 'gdrive')")
    fixture.sqlite.prepare('INSERT INTO mediaLocations (id, mediaId, connectionId, resourceKey, version) VALUES (?, ?, ?, ?, ?)').run('nas-location', b.id, nas, 'movie.mp4', 'v1')
    fixture.sqlite.prepare('INSERT INTO mediaLocations (id, mediaId, connectionId, resourceKey, version) VALUES (?, ?, ?, ?, ?)').run('drive-location', c.id, 'google-drive', 'movie', 'v1')
    const closed = vi.fn()
    const open: OpenCopySource = async (_db, filename) => filename.startsWith('/') ? {adapter: createLocalOriginalAdapter(), key: filename} : {
      key: filename, adapter: {provider: filename.startsWith('nas:') ? 'nas' : 'gdrive', capabilities: READ_SOURCE_CAPABILITIES,
        list: async () => ({entries: []}), stat: async () => ({resourceKey: filename, name: 'movie.mp4', size: 4, isDirectory: false, contentType: 'video/mp4', version: 'v1'}),
        read: async () => ({status: 200, headers: {}, body: Readable.from(['data'])}), close: closed},
    }
    const verification = await verifyCopiesForMerge(db, [a.id, b.id, c.id], signal(), open)
    expect(verification.copies.map(row => row.sha256)).toEqual(Array(3).fill(createHash('sha256').update('data').digest('hex')))
    expect(closed).toHaveBeenCalledTimes(4)
    const insert = fixture.sqlite.prepare('INSERT INTO verifiedMediaCopies (id, mediaId, path, version, sha256, size, contentType, availability, verifiedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    for (const copy of verification.copies) insert.run(copy.id, a.id, copy.path, copy.version, copy.sha256, copy.size, copy.contentType, 'available', copy.verifiedAt)
    const observation = () => fixture.sqlite.prepare(`SELECT ${CATALOG_SOURCE_TOKENS_SQL} AS tokens, ${CATALOG_AVAILABILITY_SQL} AS availability FROM media WHERE id = ?`).get(a.id) as {tokens: string; availability: string}
    expect(JSON.parse(observation().tokens)).toEqual(expect.arrayContaining(['local', 'nas', 'gdrive', `connection:${nas}`]))
    markCatalogSourceDisconnected(db, nas)
    expect(copyCandidates(db, a.id).find(copy => copy.provider === 'nas')?.availability).toBe('unavailable')
    expect(observation().availability).toBe('available')
    const remote = copyCandidates(db, a.id).find(copy => copy.provider === 'gdrive')!
    setPreferredCopy(db, a.id, remote.id)
    const unavailable: OpenCopySource = async (db, filename, signal) => {
      if (!filename.startsWith('/')) throw new Error('disconnected')
      return open(db, filename, signal)
    }
    expect((await selectPlayableCopy(db, a.id, signal(), unavailable)).url).toContain(verification.copies[0].id)
  })

  it('keeps an unreadable source file as an unavailable backup copy and re-checks it when it returns', async () => {
    strict(false)
    const a = local('kept.mp4'), b = local('gone.mp4')
    const oshash = (await verifyCopiesForMerge(db, [a.id], signal())).copies[0].oshash
    fixture.sqlite.prepare('UPDATE media SET oshash = ? WHERE id IN (?, ?)').run(oshash, a.id, b.id)
    fs.rmSync(b.path)
    const result = await merge(a.id, b.id)
    expect(result.deletedIds).toEqual([b.id])
    expect(result.unavailableCopyPaths).toEqual([b.path])
    const backup = copyCandidates(db, a.id).find(copy => copy.path === b.path)!
    expect(backup).toMatchObject({availability: 'unavailable', version: UNVERIFIED_COPY_VERSION, verified: true})
    fs.writeFileSync(b.path, 'same movie bytes')
    setPreferredCopy(db, a.id, backup.id)
    expect((await selectPlayableCopy(db, a.id, signal())).url).toContain(encodeURIComponent(backup.id))
    expect(copyCandidates(db, a.id).find(copy => copy.id === backup.id)?.version).not.toBe(UNVERIFIED_COPY_VERSION)
  })

  it('refuses to keep an unreadable source without a catalog fingerprint or with a different one', async () => {
    strict(false)
    const a = local('kept.mp4'), b = local('no-hash.mp4'), c = local('other.mp4')
    fixture.sqlite.prepare("UPDATE media SET oshash = 'ffffffffffffffff' WHERE id = ?").run(c.id)
    fs.rmSync(b.path); fs.rmSync(c.path)
    await expect(merge(a.id, b.id)).rejects.toMatchObject({code: 'copy_unavailable_unverified'})
    await expect(merge(a.id, c.id)).rejects.toMatchObject({code: 'copy_content_mismatch'})
    expect(copyCandidates(db, a.id)).toHaveLength(1)
  })

  it('on explicit trust keeps unreadable files without a fingerprint, survivor included, and adopts them by size', async () => {
    strict(false)
    const a = local('kept.mp4'), b = local('unplugged.mp4'), c = local('survivor-unplugged.mp4'), d = local('online.mp4')
    fs.rmSync(b.path); fs.rmSync(c.path)
    await expect(merge(a.id, b.id)).rejects.toMatchObject({code: 'copy_unavailable_unverified'})
    const result = await mergeMediaItems(db, {survivorId: a.id, sourceIds: [b.id], trustUnavailable: true})
    expect(result.unavailableCopyPaths).toEqual([b.path])
    const backup = copyCandidates(db, a.id).find(copy => copy.path === b.path)!
    expect(backup).toMatchObject({availability: 'unavailable', version: TRUSTED_COPY_VERSION, relationship: 'copy'})
    fs.writeFileSync(b.path, 'other movie size')
    fs.appendFileSync(b.path, '!')
    setPreferredCopy(db, a.id, backup.id)
    expect((await selectPlayableCopy(db, a.id, signal())).url).not.toContain(encodeURIComponent(backup.id))
    fs.writeFileSync(b.path, 'same movie bytes')
    expect((await selectPlayableCopy(db, a.id, signal())).url).toContain(encodeURIComponent(backup.id))
    expect(copyCandidates(db, a.id).find(copy => copy.id === backup.id)?.stored?.oshash).toBeTruthy()

    const merged = await mergeMediaItems(db, {survivorId: c.id, sourceIds: [d.id], trustUnavailable: true})
    expect(merged.unavailableCopyPaths).toEqual([c.path])
    expect(copyCandidates(db, c.id).map(copy => copy.path).sort()).toEqual([c.path, d.path].sort())
  })

  it('rejects short reads, changing source validators, cancellation, and stale merge snapshots', async () => {
    const a = local('a.mp4')
    const adapter = createLocalOriginalAdapter()
    adapter.read = async () => ({status: 200, headers: {}, body: Buffer.from('short')})
    await expect(hashCopy(adapter, a.path, signal(), () => {})).rejects.toMatchObject({code: 'source_version_changed'})
    const cancelled = new AbortController(); cancelled.abort()
    await expect(verifyCopiesForMerge(db, [a.id], cancelled.signal)).rejects.toThrow()
    const checked = await verifyCopiesForMerge(db, [a.id], signal())
    createMediaRepository(db.drizzle).updateById(a.id, {path: '/changed.mp4'})
    expect(checked.assertUnchanged).toThrow('media_changed')
  })

  it('serves pinned byte ranges and rejects stale stream URLs through HTTP', async () => {
    const a = local('a.mp4'), b = local('b.mp4')
    await merge(a.id, b.id)
    const app = express(); app.use(express.json()); app.use('/api/Media/:id/copies', mediaCopiesRouter(db))
    const server = app.listen(0, '127.0.0.1')
    try {
      await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
      const address = server.address() as {port: number}
      const base = `http://127.0.0.1:${address.port}`
      const plan = await (await fetch(`${base}/api/Media/${a.id}/copies/playable`)).json() as {url: string}
      const response = await fetch(base + plan.url, {headers: {Range: 'bytes=2-5'}})
      expect(response.status).toBe(206)
      expect(response.headers.get('content-range')).toBe('bytes 2-5/16')
      expect(await response.text()).toBe('me m')
      const copyId = new URL(base + plan.url).searchParams.get('copyId')
      const filename = copyCandidates(db, a.id).find(copy => copy.id === copyId)!.path
      fs.writeFileSync(filename, 'alternate edit!!')
      expect((await fetch(base + plan.url)).status).toBe(409)
      expect((await fetch(`${base}/api/Media/${a.id}/copies/stream?copyId=missing`)).status).toBe(404)
    } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  })
})
