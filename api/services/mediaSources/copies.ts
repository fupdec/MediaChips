import {parseCloudMediaPath, cloudMediaPath} from '../../../shared/cloudAccounts'
import type {CopyVerificationMethod} from '../../../shared/copyVerification'
import {copyVerificationMethod} from './copyVerification'
import {computeSourceOshash} from './oshash'
import {createHash, randomUUID} from 'crypto'
import {Readable} from 'stream'
import {pipeline} from 'stream/promises'
import {and, eq, inArray} from 'drizzle-orm'
import type {Request, Response} from 'express'
import type {ApiDb} from '../../types/db'
import {media} from '../../db/schema/media'
import {mediaLocations, sourceConnections} from '../../db/schema/mediaSources'
import {verifiedMediaCopies, mediaCopyPreferences} from '../../db/schema/mediaCopies'
import {nasMediaPath, parseNasMediaPath} from '../../../shared/remoteMedia'
import {driveMediaPath, parseDriveMediaPath} from '../../../shared/cloudDrive'
import {DEFAULT_DRIVE_CONNECTION_ID} from '../../../shared/mediaSources'
import {mediaFileContentType} from '../../../shared/mediaFormats'
import type {MediaCopy, MediaCopies} from '../../../shared/mediaCopies'
import {createLocalOriginalAdapter, localOriginalKey} from './localAdapter'
import {openSource, pinSourceDb, sourceError} from './context'
import {nasVersionMatches} from './locations'
import type {SourceReadAdapter, SourceObject} from './adapter'
import {offlinePlayback, getOfflineFile, sendOfflineFile} from './offline'
import {invalidateMediaDerivedCaches} from '../mediaCacheInvalidation'

type VerifiedCopy = typeof verifiedMediaCopies.$inferSelect
export type CopyCandidate = MediaCopy & {version: string; stored?: VerifiedCopy}
export type OpenCopySource = (db: ApiDb, path: string, signal: AbortSignal) => Promise<{adapter: SourceReadAdapter; key: string}>
export const openCopySource: OpenCopySource = async (db, path, signal) => {
  const cloud = parseCloudMediaPath(path)
  if (cloud) return {adapter: await openSource(db, cloud.connectionId, signal), key: cloud.resourceKey}
  const nas = parseNasMediaPath(path)
  const drive = parseDriveMediaPath(path)
  if (nas || drive) return {adapter: await openSource(db, nas?.connectionId || DEFAULT_DRIVE_CONNECTION_ID, signal), key: nas?.relativePath || drive!}
  return {adapter: createLocalOriginalAdapter(), key: localOriginalKey(path)}
}
const provider = (path: string): MediaCopy['provider'] => parseCloudMediaPath(path)?.provider || (parseNasMediaPath(path) ? 'nas' : parseDriveMediaPath(path) ? 'gdrive' : 'local')
const canonicalPath = (path: string) => {
  const nas = parseNasMediaPath(path)
  return nas ? nasMediaPath(nas.connectionId, nas.relativePath) : path
}

export function copyCandidates(db: ApiDb, mediaId: number): CopyCandidate[] {
  const card = db.drizzle.select().from(media).where(eq(media.id, mediaId)).get()
  if (!card || card.deletedAt) throw sourceError('media_not_found', 404)
  const stored = db.drizzle.select().from(verifiedMediaCopies).where(eq(verifiedMediaCopies.mediaId, mediaId)).all()
  const copies: CopyCandidate[] = stored.map(row => ({id: row.id, path: row.path, provider: provider(row.path),
    availability: row.availability, verifiedAt: row.verifiedAt, verificationMethod: row.verificationMethod, verified: true, version: row.version, stored: row}))
  if (stored.length) return copies
  const add = (copy: CopyCandidate) => {
    if (!copies.some(row => canonicalPath(row.path) === canonicalPath(copy.path))) copies.push(copy)
  }
  const locations = db.drizzle.select({location: mediaLocations, connection: sourceConnections}).from(mediaLocations)
    .innerJoin(sourceConnections, eq(sourceConnections.id, mediaLocations.connectionId)).where(eq(mediaLocations.mediaId, mediaId)).all()
  for (const {location, connection} of locations) add({id: `location:${location.id}`, provider: connection.provider,
    path: connection.provider === 'nas' ? nasMediaPath(connection.id, location.resourceKey) : connection.id !== DEFAULT_DRIVE_CONNECTION_ID ? cloudMediaPath(connection.provider as import('../../../shared/cloudAccounts').CloudProvider, connection.id, location.resourceKey) : driveMediaPath(location.resourceKey),
    availability: location.availability, verifiedAt: location.lastVerifiedAt, verified: false, version: location.version})
  // A retained location replaces its legacy compatibility URI. Local originals remain candidates.
  if (!locations.length || provider(card.path) === 'local') add({id: 'original', path: card.path,
    provider: provider(card.path), availability: 'unknown', verifiedAt: null, verified: false, version: ''})
  return copies
}

export function listMediaCopies(db: ApiDb, mediaId: number): MediaCopies {
  return {copies: copyCandidates(db, mediaId).map(({stored: _stored, version: _version, ...copy}) => copy),
    preferredId: db.drizzle.select().from(mediaCopyPreferences).where(eq(mediaCopyPreferences.mediaId, mediaId)).get()?.copyId || null}
}
export function setPreferredCopy(db: ApiDb, mediaId: number, copyId: string | null) {
  const copies = copyCandidates(db, mediaId)
  if (copyId !== null && !copies.some(copy => copy.id === copyId && copy.verified)) throw sourceError('copy_not_verified', 409)
  if (copyId === null) db.drizzle.delete(mediaCopyPreferences).where(eq(mediaCopyPreferences.mediaId, mediaId)).run()
  else db.drizzle.insert(mediaCopyPreferences).values({mediaId, copyId}).onConflictDoUpdate({target: mediaCopyPreferences.mediaId, set: {copyId}}).run()
  return listMediaCopies(db, mediaId)
}
const validFile = (file: SourceObject) => {
  if (file.isDirectory || !Number.isSafeInteger(file.size) || file.size < 0 || !file.version) throw sourceError('invalid_file', 400)
}
const matchesVersion = (copy: CopyCandidate, file: SourceObject) => !copy.version || (copy.provider === 'nas'
  ? nasVersionMatches(copy.version, file.version) : copy.version === file.version)

/** Stream every byte; a provider revision, oshash or visual similarity cannot prove identity. */
export async function hashCopy(adapter: SourceReadAdapter, key: string, signal: AbortSignal, assertCurrent: () => void,
  options: {maxSize?: number; statAfter?: () => Promise<SourceObject>} = {}) {
  signal.throwIfAborted()
  const before = await adapter.stat(key, signal)
  validFile(before); assertCurrent(); signal.throwIfAborted()
  if (options.maxSize !== undefined && before.size > options.maxSize) throw sourceError('source_version_changed')
  const download = await adapter.read(key, undefined, signal)
  if (download.status !== 200) {
    if (!Buffer.isBuffer(download.body)) download.body.destroy()
    throw sourceError('copy_read_failed')
  }
  const hash = createHash('sha256')
  let size = 0
  const body = Buffer.isBuffer(download.body) ? Readable.from([download.body]) : download.body
  try {
    for await (const chunk of body) {
      assertCurrent(); signal.throwIfAborted()
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.length
      if (size > before.size) throw sourceError('source_version_changed')
      hash.update(bytes)
    }
  } finally { body.destroy() }
  const after = await (options.statAfter ? options.statAfter() : adapter.stat(key, signal))
  assertCurrent(); signal.throwIfAborted()
  if (size !== before.size || after.size !== before.size || after.version !== before.version) throw sourceError('source_version_changed')
  return {sha256: hash.digest('hex'), file: after}
}

type CopyFingerprint = {
  file: SourceObject
  sha256: string
  oshash: string | null
  verificationMethod: CopyVerificationMethod
}

/** The fast mode owns fresh range sessions and never requests a complete large file. */
export async function fingerprintCopy(db: ApiDb, path: string, method: CopyVerificationMethod, signal: AbortSignal,
  assertCurrent: () => void, open: OpenCopySource): Promise<CopyFingerprint> {
  const first = await open(db, path, signal)
  let transferred = false
  try {
    const before = await first.adapter.stat(first.key, signal)
    validFile(before); assertCurrent(); signal.throwIfAborted()
    // Oshash is undefined for <= 8 bytes. Reading these tiny files completely is bounded too.
    if (method === 'sha256' || before.size <= 8) {
      const checked = await hashCopy(first.adapter, first.key, signal, assertCurrent, {
        maxSize: method === 'oshash' ? 8 : undefined,
        async statAfter() {
          const next = await open(db, path, signal)
          try {
            if (next.key !== first.key) throw sourceError('media_changed')
            return await next.adapter.stat(next.key, signal)
          } finally { next.adapter.close() }
        },
      })
      return {...checked, oshash: null, verificationMethod: 'sha256'}
    }
    const sampled = await computeSourceOshash(async attemptSignal => {
      if (!transferred) { transferred = true; return first.adapter }
      const next = await open(db, path, attemptSignal)
      if (next.key !== first.key) { next.adapter.close(); throw sourceError('media_changed') }
      return next.adapter
    }, first.key, {signal, assertCurrent, validate(file) {
      if (file.version !== before.version || file.size !== before.size) throw sourceError('source_version_changed')
    }})
    return {file: sampled.file, sha256: '', oshash: sampled.value, verificationMethod: 'oshash'}
  } finally { if (!transferred) first.adapter.close() }
}

const comparisonKey = (checked: CopyFingerprint) => `${checked.verificationMethod}:${checked.file.size}:${checked.oshash || checked.sha256}`

/** No writes until all selected cards and retained copies pass the configured comparison. */
export async function verifyCopiesForMerge(db: ApiDb, ids: number[], signal: AbortSignal, open = openCopySource,
  method = copyVerificationMethod(db)) {
  const pinned = pinSourceDb(db)
  db = pinned.db
  const snapshot = () => JSON.stringify(ids.map(id => ({
    card: db.drizzle.select().from(media).where(eq(media.id, id)).get(), copies: copyCandidates(db, id),
  })))
  const initial = snapshot()
  const result: Array<Omit<VerifiedCopy, 'mediaId'>> = []
  let expected: string | undefined
  for (const id of ids) {
    for (const copy of copyCandidates(db, id)) {
      if (method === 'sha256' && copy.stored?.oshash && !copy.stored.sha256) {
        const baseline = await fingerprintCopy(db, copy.path, 'oshash', signal, pinned.assertCurrent, open)
        if (baseline.oshash !== copy.stored.oshash || baseline.file.size !== copy.stored.size) throw sourceError('copy_content_mismatch')
      }
      const checked = await fingerprintCopy(db, copy.path, method, signal, pinned.assertCurrent, open)
      const {file, sha256, oshash, verificationMethod} = checked
      if (!matchesVersion(copy, file) && !copy.stored) throw sourceError('source_version_changed')
      const storedMismatch = copy.stored && (copy.stored.size !== file.size
        || (verificationMethod === 'sha256' && copy.stored.sha256 && copy.stored.sha256 !== sha256)
        || (verificationMethod === 'oshash' && copy.stored.oshash && copy.stored.oshash !== oshash))
      if (storedMismatch || (expected && comparisonKey(checked) !== expected)) throw sourceError('copy_content_mismatch')
      expected = comparisonKey(checked)
      const path = canonicalPath(copy.path)
      const retainedSha256 = sha256 || (copy.stored?.version === file.version ? copy.stored.sha256 : '')
      if (!result.some(row => row.path === path)) result.push({id: copy.stored?.id || randomUUID(), path,
        version: file.version, sha256: retainedSha256, oshash,
        verificationMethod: retainedSha256 ? 'sha256' : verificationMethod, size: file.size,
        contentType: mediaFileContentType(file.name) || file.contentType,
        availability: 'available', verifiedAt: !sha256 && retainedSha256 && copy.stored ? copy.stored.verifiedAt : new Date().toISOString()})
    }
  }
  if (!result.length) throw sourceError('copy_not_found', 404)
  return {copies: result, method, assertUnchanged() {
    pinned.assertCurrent(); signal.throwIfAborted()
    if (snapshot() !== initial) throw sourceError('media_changed')
  }}
}

function observe(db: ApiDb, mediaId: number, copy: CopyCandidate, availability: 'available' | 'unavailable') {
  if (copy.stored) db.drizzle.update(verifiedMediaCopies).set({availability}).where(and(eq(verifiedMediaCopies.id, copy.id), eq(verifiedMediaCopies.mediaId, mediaId))).run()
  if (copy.id.startsWith('location:')) db.drizzle.update(mediaLocations).set({availability}).where(eq(mediaLocations.id, copy.id.slice(9))).run()
  invalidateMediaDerivedCaches()
}

/** Stat permissions can differ from read permissions. Probe one byte before choosing a source. */
async function probeReadable(adapter: SourceReadAdapter, key: string, size: number, signal: AbortSignal) {
  const read = await adapter.read(key, size ? 'bytes=0-0' : undefined, signal)
  const body = Buffer.isBuffer(read.body) ? Readable.from([read.body]) : read.body
  try {
    if (read.status !== 200 && read.status !== 206) throw sourceError('copy_read_failed')
    if (size) {
      const first = await body[Symbol.asyncIterator]().next()
      if (first.done || !first.value.length) throw sourceError('copy_read_failed')
    }
  } finally { body.destroy() }
}

/** Pin a concrete copy in the URL. A range request must never silently switch representations. */
export async function selectPlayableCopy(db: ApiDb, mediaId: number, signal: AbortSignal, open = openCopySource) {
  const pinned = pinSourceDb(db)
  db = pinned.db
  const copies = copyCandidates(db, mediaId)
  const preferred = listMediaCopies(db, mediaId).preferredId
  const verified = copies.some(copy => copy.verified)
  const cardPath = db.drizzle.select({path: media.path}).from(media).where(eq(media.id, mediaId)).get()!.path
  const ordered = copies.filter(copy => verified ? copy.verified : canonicalPath(copy.path) === canonicalPath(cardPath) || copies.length === 1).sort((a, b) =>
    Number(b.id === preferred) - Number(a.id === preferred) || Number(b.provider === 'local') - Number(a.provider === 'local'))
  for (const copy of ordered) {
    let adapter: SourceReadAdapter | undefined
    try {
      const attempt = new AbortController()
      const attemptSignal = AbortSignal.any([signal, attempt.signal])
      const timer = setTimeout(() => attempt.abort(), 30_000)
      let opened: Awaited<ReturnType<OpenCopySource>>
      let file: SourceObject
      try {
        opened = await open(db, copy.path, attemptSignal)
        adapter = opened.adapter
        file = await adapter.stat(opened.key, attemptSignal)
        validFile(file)
        await probeReadable(adapter, opened.key, file.size, attemptSignal)
      } finally { clearTimeout(timer) }
      validFile(file); pinned.assertCurrent(); signal.throwIfAborted()
      if (!matchesVersion(copy, file)) {
        if (!copy.stored) throw sourceError('source_version_changed')
        const method = copyVerificationMethod(db)
        const useFull = method === 'sha256' && Boolean(copy.stored.sha256)
        const expectedOshash = copy.stored.oshash || copies.find(row => row.stored?.oshash && row.stored.size === copy.stored!.size)?.stored?.oshash
        if (!useFull && !expectedOshash && file.size > 8) throw sourceError('copy_not_verified')
        // The probe session may be closed by FTP. Verification opens its own bounded sessions.
        adapter.close(); adapter = undefined
        const checked = await fingerprintCopy(db, copy.path, useFull ? 'sha256' : 'oshash', signal, pinned.assertCurrent, open)
        if (checked.file.size !== copy.stored.size || (checked.verificationMethod === 'sha256'
          ? checked.sha256 !== copy.stored.sha256 : checked.oshash !== expectedOshash)) throw sourceError('copy_content_mismatch')
        const beforeWrite = copyCandidates(db, mediaId).find(row => row.id === copy.id)
        if (!beforeWrite || beforeWrite.path !== copy.path || beforeWrite.version !== copy.version
          || beforeWrite.stored?.sha256 !== copy.stored.sha256 || beforeWrite.stored?.oshash !== copy.stored.oshash) throw sourceError('media_changed')
        db.drizzle.update(verifiedMediaCopies).set({version: checked.file.version, verifiedAt: new Date().toISOString(),
          sha256: checked.sha256, oshash: checked.oshash, verificationMethod: checked.verificationMethod}).where(eq(verifiedMediaCopies.id, copy.id)).run()
        copy.version = checked.file.version
        copy.stored = {...copy.stored, version: checked.file.version, sha256: checked.sha256, oshash: checked.oshash, verificationMethod: checked.verificationMethod}
        file = checked.file
      } else if (copy.stored && !copy.stored.oshash && file.size > 8 && copyVerificationMethod(db) === 'oshash') {
        // Seed a cheap baseline for legacy SHA-verified rows while their original version still matches.
        adapter.close(); adapter = undefined
        const checked = await fingerprintCopy(db, copy.path, 'oshash', signal, pinned.assertCurrent, open)
        if (checked.file.version !== file.version) throw sourceError('source_version_changed')
        const beforeWrite = copyCandidates(db, mediaId).find(row => row.id === copy.id)
        if (!beforeWrite || beforeWrite.path !== copy.path || beforeWrite.version !== copy.version) throw sourceError('media_changed')
        db.drizzle.update(verifiedMediaCopies).set({oshash: checked.oshash}).where(eq(verifiedMediaCopies.id, copy.id)).run()
        copy.stored = {...copy.stored, oshash: checked.oshash}
      }
      const current = copyCandidates(db, mediaId).find(row => row.id === copy.id)
      if (!current || current.path !== copy.path || current.version !== copy.version || current.stored?.sha256 !== copy.stored?.sha256 || current.stored?.oshash !== copy.stored?.oshash) throw sourceError('media_changed')
      observe(db, mediaId, copy, 'available')
      return {url: `/api/Media/${mediaId}/copies/stream?copyId=${encodeURIComponent(copy.id)}&version=${encodeURIComponent(file.version)}`,
        kind: 'mp4' as const, title: '', qualities: [], quality: null, adaptive: false}
    } catch (err) {
      pinned.assertCurrent(); signal.throwIfAborted()
      observe(db, mediaId, copy, 'unavailable')
    } finally { adapter?.close() }
  }
  // Preserve the existing verified offline cache when the original connection is down.
  try {
    const cached = getOfflineFile(db, mediaId)
    const location = cached.resolved.location
    const cachedPath = cached.resolved.provider === 'nas' ? nasMediaPath(location.connectionId, location.resourceKey) : location.connectionId !== DEFAULT_DRIVE_CONNECTION_ID ? cloudMediaPath(cached.resolved.provider as import('../../../shared/cloudAccounts').CloudProvider, location.connectionId, location.resourceKey) : driveMediaPath(location.resourceKey)
    if (cached.ready && copies.some(copy => copy.path === cachedPath && copy.version === location.version)) {
      const offline = offlinePlayback(db, mediaId)
      if (offline) return offline
    }
  } catch { /* No compatible cache. */ }
  throw sourceError('no_available_copy')
}

export async function streamMediaCopy(db: ApiDb, mediaId: number, req: Request, res: Response, signal: AbortSignal, open = openCopySource) {
  const pinned = pinSourceDb(db)
  db = pinned.db
  let copyId = typeof req.query.copyId === 'string' ? req.query.copyId : undefined
  let version = typeof req.query.version === 'string' ? req.query.version : undefined
  if (!copyId) {
    const plan = await selectPlayableCopy(db, mediaId, signal, open)
    if (plan.url.includes('/offline/stream')) { sendOfflineFile(db, mediaId, res); return }
    const params = new URL(plan.url, 'http://localhost').searchParams
    copyId = params.get('copyId')!; version = params.get('version')!
  }
  const copy = copyCandidates(db, mediaId).find(row => row.id === copyId)
  if (!copy) throw sourceError('copy_not_found', 404)
  // Never allow unverified alternatives to bypass the selection policy.
  const candidates = copyCandidates(db, mediaId)
  const cardPath = db.drizzle.select({path: media.path}).from(media).where(eq(media.id, mediaId)).get()!.path
  if (!copy.verified && (candidates.some(row => row.verified) || (candidates.length > 1 && canonicalPath(copy.path) !== canonicalPath(cardPath)))) throw sourceError('copy_not_verified')
  const {adapter, key} = await open(db, copy.path, signal)
  let body: Readable | Buffer | undefined
  try {
    const file = await adapter.stat(key, signal)
    validFile(file); pinned.assertCurrent(); signal.throwIfAborted()
    if (!version || file.version !== version || !matchesVersion(copy, file)) throw sourceError('source_version_changed')
    const etag = `"${createHash('sha256').update(version).digest('hex')}"`
    const range = req.headers['if-range'] && req.headers['if-range'] !== etag ? undefined : req.headers.range
    const read = await adapter.read(key, range, signal)
    body = read.body
    const after = await adapter.stat(key, signal)
    pinned.assertCurrent(); signal.throwIfAborted()
    if (after.version !== version || after.size !== file.size) throw sourceError('source_version_changed')
    res.status(read.status)
    for (const name of ['content-length', 'content-range', 'accept-ranges']) if (read.headers[name]) res.setHeader(name, read.headers[name]!)
    res.setHeader('Content-Type', copy.stored?.contentType || mediaFileContentType(file.name) || file.contentType)
    res.setHeader('ETag', etag)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (Buffer.isBuffer(read.body)) res.end(read.body)
    else await pipeline(read.body, res, {signal})
  } finally { if (body && !Buffer.isBuffer(body)) body.destroy(); adapter.close() }
}

/** Keep already verified copies when the generic metadata merger removes source cards. */
export function remapVerifiedCopies(tx: Parameters<Parameters<ApiDb['drizzle']['transaction']>[0]>[0], survivorId: number, sourceIds: number[]) {
  const rows = tx.select().from(verifiedMediaCopies).where(inArray(verifiedMediaCopies.mediaId, sourceIds)).all()
  for (const row of rows) {
    const existing = tx.select().from(verifiedMediaCopies).where(and(eq(verifiedMediaCopies.mediaId, survivorId), eq(verifiedMediaCopies.path, row.path))).get()
    if (existing) tx.delete(verifiedMediaCopies).where(eq(verifiedMediaCopies.id, row.id)).run()
    else tx.update(verifiedMediaCopies).set({mediaId: survivorId}).where(eq(verifiedMediaCopies.id, row.id)).run()
  }
}


export async function attachLocalMediaCopy(db: ApiDb, mediaId: number, path: string, signal: AbortSignal, open = openCopySource) {
  path = localOriginalKey(path)
  const pinned = pinSourceDb(db)
  db = pinned.db
  const owner = () => db.sqlite.prepare('SELECT id FROM media WHERE path = ? AND id != ? UNION SELECT mediaId FROM verifiedMediaCopies WHERE path = ? AND mediaId != ? LIMIT 1').get(path, mediaId, path, mediaId)
  if (owner()) throw sourceError('copy_already_cataloged')
  const verification = await verifyCopiesForMerge(db, [mediaId], signal, open)
  if (verification.copies.some(copy => copy.path === path)) return listMediaCopies(db, mediaId)
  const checked = await fingerprintCopy(db, path, verification.method, signal, pinned.assertCurrent, open)
  const reference = verification.copies[0]
  if (checked.file.size !== reference.size || (checked.verificationMethod === 'sha256'
    ? checked.sha256 !== reference.sha256 : checked.oshash !== reference.oshash)) throw sourceError('copy_content_mismatch')
  db.drizzle.transaction(tx => {
    verification.assertUnchanged()
    if (owner()) throw sourceError('copy_already_cataloged')
    const copies = [...verification.copies, {id: randomUUID(), path, sha256: checked.sha256, oshash: checked.oshash,
      verificationMethod: checked.verificationMethod, version: checked.file.version, size: checked.file.size,
      contentType: mediaFileContentType(checked.file.name) || checked.file.contentType,
      availability: 'available' as const, verifiedAt: new Date().toISOString()}]
    for (const copy of copies) tx.insert(verifiedMediaCopies).values({...copy, mediaId})
      .onConflictDoUpdate({target: [verifiedMediaCopies.mediaId, verifiedMediaCopies.path], set: {
        sha256: copy.sha256, oshash: copy.oshash, verificationMethod: copy.verificationMethod,
        version: copy.version, size: copy.size, verifiedAt: copy.verifiedAt, availability: copy.availability,
      }}).run()
  })
  invalidateMediaDerivedCaches()
  return listMediaCopies(db, mediaId)
}

export function detachMediaCopy(db: ApiDb, mediaId: number, copyId: string) {
  const copies = copyCandidates(db, mediaId)
  if (!copies.some(copy => copy.id === copyId && copy.verified)) throw sourceError('copy_not_found', 404)
  if (copies.length <= 1) throw sourceError('last_copy', 409)
  db.drizzle.transaction(tx => {
    tx.delete(mediaCopyPreferences).where(and(eq(mediaCopyPreferences.mediaId, mediaId), eq(mediaCopyPreferences.copyId, copyId))).run()
    const detached = copies.find(copy => copy.id === copyId)!
    const card = tx.select().from(media).where(eq(media.id, mediaId)).get()!
    if (canonicalPath(card.path) === detached.path) {
      tx.update(media).set({path: copies.find(copy => copy.id !== copyId)!.path}).where(eq(media.id, mediaId)).run()
    }
    const cloud = parseCloudMediaPath(detached.path)
    const nas = parseNasMediaPath(detached.path)
    const drive = parseDriveMediaPath(detached.path)
    if (nas || drive || cloud) tx.delete(mediaLocations).where(and(eq(mediaLocations.mediaId, mediaId),
      eq(mediaLocations.connectionId, cloud?.connectionId || nas?.connectionId || DEFAULT_DRIVE_CONNECTION_ID), eq(mediaLocations.resourceKey, cloud?.resourceKey || nas?.relativePath || drive!))).run()
    tx.delete(verifiedMediaCopies).where(and(eq(verifiedMediaCopies.mediaId, mediaId), eq(verifiedMediaCopies.id, copyId))).run()
  })
  invalidateMediaDerivedCaches()
  return listMediaCopies(db, mediaId)
}
