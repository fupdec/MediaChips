import fs from 'node:fs'
import path from 'node:path'
import {createMediaServerProfiles} from './mediaServerProfiles'
import type Database from 'better-sqlite3'

/** Keep profile metadata and library membership outside the replaceable library file.
 * The local rows retain their IDs and remain foreign-key targets for library data.
 */
export function installSourceProfiles(sqlite: Database.Database, databasesPath: string, libraryId: string) {
  if (hasSourceProfiles(sqlite)) return
  const columns = sqlite.pragma('main.table_info(sourceConnections)') as Array<{name: string}>
  const hasProvider = columns.some(column => column.name === 'provider')
  const registry = path.join(databasesPath, '.source-profiles.sqlite')
  fs.closeSync(fs.openSync(registry, 'a', 0o600))
  sqlite.prepare('ATTACH DATABASE ? AS source_profiles').run(registry)
  try {
    sqlite.transaction(() => {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS source_profiles.remoteProfiles (
          id TEXT PRIMARY KEY, provider TEXT NOT NULL, config TEXT NOT NULL,
          credentialRef TEXT NOT NULL, createdAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS source_profiles.libraryProfiles (
          libraryId TEXT NOT NULL, profileId TEXT NOT NULL,
          PRIMARY KEY (libraryId, profileId)
        );
        CREATE TABLE IF NOT EXISTS source_profiles.mediaServerProfiles (
          id TEXT PRIMARY KEY, provider TEXT NOT NULL, baseUrl TEXT NOT NULL,
          UNIQUE (provider, baseUrl)
        );
        CREATE TABLE IF NOT EXISTS source_profiles.mediaServerBindings (
          libraryId TEXT NOT NULL, provider TEXT NOT NULL, profileId TEXT NOT NULL,
          PRIMARY KEY (libraryId, provider)
        );
      `)
      if (!columns.length) return
      sqlite.exec(`
        INSERT OR IGNORE INTO source_profiles.remoteProfiles
          SELECT id, ${hasProvider ? 'provider' : "'nas'"}, config, credentialRef, createdAt
          FROM main.sourceConnections;
      `)
      sqlite.prepare(`INSERT OR IGNORE INTO source_profiles.libraryProfiles
        SELECT ?, id FROM main.sourceConnections`).run(libraryId)
      if (!hasProvider) return
      sqlite.prepare(`
        INSERT INTO main.sourceConnections (id, provider, config, credentialRef, createdAt)
          SELECT p.id, p.provider, p.config, p.credentialRef, p.createdAt
          FROM source_profiles.remoteProfiles p
          JOIN source_profiles.libraryProfiles b ON b.profileId = p.id
          WHERE b.libraryId = ?
        ON CONFLICT(id) DO UPDATE SET config = excluded.config, credentialRef = excluded.credentialRef
          WHERE sourceConnections.provider = excluded.provider
            AND (sourceConnections.config <> excluded.config OR sourceConnections.credentialRef <> excluded.credentialRef)
      `).run(libraryId)
    })()

    migrateJellyfinProfile(sqlite, databasesPath, libraryId)
    if (!hasProvider) return

    // TEMP triggers are connection-local and are never included in a library backup.
    sqlite.function('source_profile_library', () => libraryId)
    sqlite.exec(`
      CREATE TEMP TRIGGER save_remote_profile AFTER INSERT ON main.sourceConnections BEGIN
        INSERT INTO remoteProfiles VALUES (NEW.id, NEW.provider, NEW.config, NEW.credentialRef, NEW.createdAt)
          ON CONFLICT(id) DO UPDATE SET config = NEW.config, credentialRef = NEW.credentialRef
          WHERE provider = NEW.provider;
        INSERT OR IGNORE INTO libraryProfiles VALUES (source_profile_library(), NEW.id);
      END;
      CREATE TEMP TRIGGER update_remote_profile AFTER UPDATE OF config, credentialRef ON main.sourceConnections BEGIN
        UPDATE remoteProfiles SET config = NEW.config, credentialRef = NEW.credentialRef
          WHERE id = NEW.id AND provider = NEW.provider;
      END;
    `)
  } catch (error) {
    sqlite.exec('DETACH DATABASE source_profiles')
    throw error
  }
}

type SourceProfile = typeof import('../db/schema/mediaSources').sourceConnections.$inferSelect

function migrateJellyfinProfile(sqlite: Database.Database, databasesPath: string, libraryId: string) {
  if (!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get()) return
  const settings = sqlite.prepare("SELECT option, value FROM settings WHERE option IN ('jellyfinBaseUrl', 'jellyfinApiKey')")
    .all() as Array<{option: string; value: string | null}>
  const baseUrl = settings.find(setting => setting.option === 'jellyfinBaseUrl')?.value
  const apiKey = settings.find(setting => setting.option === 'jellyfinApiKey')?.value
  if (!baseUrl || !apiKey) return
  const profiles = createMediaServerProfiles(sqlite, databasesPath, libraryId, 'jellyfin')
  if (!profiles.list().some(profile => profile.selected)) {
    profiles.save(baseUrl, profiles.credential(baseUrl) ? '' : apiKey)
  }
  sqlite.exec("DELETE FROM settings WHERE option IN ('jellyfinBaseUrl', 'jellyfinApiKey')")
}

function hasSourceProfiles(sqlite: Database.Database) {
  const attached = sqlite.pragma('database_list') as Array<{name: string}>
  return attached.some(entry => entry.name === 'source_profiles')
}

export function listSourceProfiles(sqlite: Database.Database, provider?: SourceProfile['provider']): SourceProfile[] {
  const attached = hasSourceProfiles(sqlite)
  const from = attached
    ? 'source_profiles.remoteProfiles p LEFT JOIN main.sourceConnections b ON b.id = p.id'
    : 'main.sourceConnections p'
  const order = attached ? 'b.id IS NULL, p.createdAt, p.id' : 'p.createdAt, p.id'
  const query = `SELECT p.* FROM ${from} ${provider ? 'WHERE p.provider = ?' : ''} ORDER BY ${order}`
  return sqlite.prepare(query).all(...(provider ? [provider] : [])) as SourceProfile[]
}

/** Using a saved profile in a library creates its local binding. */
export function bindSourceProfile(sqlite: Database.Database, id: string, providers: SourceProfile['provider'][]) {
  if (!hasSourceProfiles(sqlite)) return
  const profile = sqlite.prepare('SELECT * FROM source_profiles.remoteProfiles WHERE id = ?').get(id) as SourceProfile | undefined
  if (!profile || !providers.includes(profile.provider)) return
  sqlite.prepare(`
    INSERT INTO main.sourceConnections (id, provider, config, credentialRef, createdAt)
      VALUES (@id, @provider, @config, @credentialRef, @createdAt)
    ON CONFLICT(id) DO UPDATE SET config = excluded.config, credentialRef = excluded.credentialRef
      WHERE sourceConnections.provider = excluded.provider
        AND (sourceConnections.config <> excluded.config OR sourceConnections.credentialRef <> excluded.credentialRef)
  `).run(profile)
  return profile
}
