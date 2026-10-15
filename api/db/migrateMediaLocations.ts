import {randomUUID} from 'crypto'
import type Database from 'better-sqlite3'
import {parseDriveMediaPath} from '../../shared/cloudDrive'
import {parseNasMediaPath} from '../../shared/remoteMedia'
import {DEFAULT_DRIVE_CONNECTION_ID, DEFAULT_DRIVE_CREDENTIAL_REF} from '../../shared/mediaSources'

/** Idempotent data migration, also run after repair of Sequelize-era schemas. No network or vault access. */
export function migrateMediaLocations(sqlite: Database.Database): void {
  const columns = sqlite.pragma('table_info(sourceConnections)') as Array<{name: string}>
  if (!columns.some(column => column.name === 'provider')) return
  const mediaColumns = sqlite.pragma('table_info(media)') as Array<{name: string}>
  if (!mediaColumns.length) return
  const originalPath = mediaColumns.some(column => column.name === 'trashOriginalPath') ? "COALESCE(NULLIF(trashOriginalPath, ''), path)" : 'path'
  sqlite.transaction(() => {
    const rows = sqlite.prepare(`SELECT id, ${originalPath} AS path FROM media
      WHERE ${originalPath} LIKE 'gdrive://%' OR ${originalPath} LIKE 'nas://%'`).all() as Array<{id: number; path: string}>
    const connection = sqlite.prepare('SELECT id FROM sourceConnections WHERE id = ? AND provider = ?')
    const existing = sqlite.prepare('SELECT id FROM mediaLocations WHERE mediaId = ? LIMIT 1')
    const insert = sqlite.prepare('INSERT OR IGNORE INTO mediaLocations (id, mediaId, connectionId, resourceKey, version) VALUES (?, ?, ?, ?, ?)')
    for (const row of rows) {
      // Once migrated, locations are authoritative; never resurrect an old URI after a move.
      if (existing.get(row.id)) continue
      const driveId = parseDriveMediaPath(row.path)
      if (driveId) {
        sqlite.prepare(`INSERT OR IGNORE INTO sourceConnections (id, provider, config, credentialRef, createdAt)
          VALUES (?, 'gdrive', '{}', ?, ?)`).run(DEFAULT_DRIVE_CONNECTION_ID, DEFAULT_DRIVE_CREDENTIAL_REF, new Date().toISOString())
        if (connection.get(DEFAULT_DRIVE_CONNECTION_ID, 'gdrive')) {
          insert.run(randomUUID(), row.id, DEFAULT_DRIVE_CONNECTION_ID, driveId, '')
        }
        continue
      }
      const nas = parseNasMediaPath(row.path)
      // Keep orphaned cards intact; a missing connection cannot be reconstructed from a URI.
      if (nas && connection.get(nas.connectionId, 'nas')) {
        const revision = row.path.match(/\?v=([0-9a-f]{64})$/i)?.[1]
        insert.run(randomUUID(), row.id, nas.connectionId, nas.relativePath, revision ? `sha256:${revision}` : '')
      }
    }
  })()
}
