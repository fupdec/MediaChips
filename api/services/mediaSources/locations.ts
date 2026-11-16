import {parseCloudMediaPath} from '../../../shared/cloudAccounts'
import {createHash, randomUUID} from 'crypto'
import {and, eq} from 'drizzle-orm'
import type {ApiDb} from '../../types/db'
import {mediaLocations, sourceConnections} from '../../db/schema/mediaSources'
import {createMediaRepository} from '../../db/repositories/media'
import {parseNasMediaPath} from '../../../shared/remoteMedia'
import {parseDriveMediaPath} from '../../../shared/cloudDrive'
import {DEFAULT_DRIVE_CONNECTION_ID, DEFAULT_DRIVE_CREDENTIAL_REF} from '../../../shared/mediaSources'

export function ensureDriveConnection(db: ApiDb): string {
  db.drizzle.insert(sourceConnections).values({id: DEFAULT_DRIVE_CONNECTION_ID, provider: 'gdrive',
    config: '{}', credentialRef: DEFAULT_DRIVE_CREDENTIAL_REF, createdAt: new Date().toISOString()}).onConflictDoNothing().run()
  const row = db.drizzle.select().from(sourceConnections).where(eq(sourceConnections.id, DEFAULT_DRIVE_CONNECTION_ID)).get()
  if (row?.provider !== 'gdrive') throw Object.assign(new Error('Conflicting Drive connection identity.'), {status: 409})
  return row.id
}

export function recordDriveLocation(db: ApiDb, mediaId: number, resourceKey: string, version: string): void {
  const connectionId = ensureDriveConnection(db)
  const previous = db.drizzle.select().from(mediaLocations).where(and(eq(mediaLocations.mediaId, mediaId),
    eq(mediaLocations.connectionId, connectionId), eq(mediaLocations.resourceKey, resourceKey))).get()
  const verified = {version, availability: 'available' as const, lastVerifiedAt: new Date().toISOString()}
  if (previous) db.drizzle.update(mediaLocations).set(verified).where(eq(mediaLocations.id, previous.id)).run()
  else db.drizzle.insert(mediaLocations).values({id: randomUUID(), mediaId, connectionId, resourceKey, ...verified}).run()
}

export function nasVersionMatches(storedVersion: string, currentVersion: string): boolean {
  return !storedVersion || storedVersion === currentVersion
    || storedVersion === `sha256:${createHash('sha256').update(currentVersion).digest('hex')}`
}

/** Resolve the original independently of credentials. Local paths retain their existing representation. */
export function resolveMediaLocation(db: ApiDb, mediaId: number) {
  const card = createMediaRepository(db.drizzle).findById(mediaId)
  if (!card || card.deletedAt) throw Object.assign(new Error('Media not found.'), {status: 404})
  const cloud = parseCloudMediaPath(card.path)
  const nas = parseNasMediaPath(card.path)
  const drive = parseDriveMediaPath(card.path)
  if (!nas && !drive && !cloud) return {provider: 'local' as const, card, path: card.path}
  const provider = cloud?.provider || (nas ? 'nas' as const : 'gdrive' as const)
  const connectionId = cloud?.connectionId || nas?.connectionId || DEFAULT_DRIVE_CONNECTION_ID
  const resourceKey = cloud?.resourceKey || nas?.relativePath || drive!
  const candidates = db.drizzle.select({location: mediaLocations, connection: sourceConnections}).from(mediaLocations)
    .innerJoin(sourceConnections, eq(sourceConnections.id, mediaLocations.connectionId))
    .where(and(eq(mediaLocations.mediaId, mediaId), eq(sourceConnections.provider, provider))).all()
  const revision = nas ? card.path.match(/\?v=([0-9a-f]{64})$/i)?.[1] : undefined
  const resolved = candidates.find(({location}) => location.connectionId === connectionId && location.resourceKey === resourceKey
    && (!revision || location.version === `sha256:${revision}` || createHash('sha256').update(location.version).digest('hex') === revision))
    ?? (candidates.length === 1 ? candidates[0] : undefined)
  if (!resolved) throw Object.assign(new Error('Source location is unavailable. Reconnect the source.'), {status: 409})
  return {provider, card, ...resolved}
}
