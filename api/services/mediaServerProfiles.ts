import {randomUUID} from 'node:crypto'
import path from 'node:path'
import type Database from 'better-sqlite3'
import type {ApiDb} from '../types/db'
import {createNasCredentialStore} from './nas/credentials'

type Provider = 'plex' | 'jellyfin' | 'emby'
type Profile = {id: string; baseUrl: string}

export function createMediaServerProfiles(sqlite: Database.Database, databasesPath: string, libraryId: string, provider: Provider) {
  const vault = createNasCredentialStore(path.join(databasesPath, '.media-server-secrets'))
  const normalize = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, '')
  const find = (baseUrl: string) => sqlite.prepare(
    'SELECT id, baseUrl FROM source_profiles.mediaServerProfiles WHERE provider = ? AND baseUrl = ?',
  ).get(provider, normalize(baseUrl)) as Profile | undefined
  const bind = (id: string) => sqlite.prepare(`
    INSERT INTO source_profiles.mediaServerBindings (libraryId, provider, profileId) VALUES (?, ?, ?)
    ON CONFLICT(libraryId, provider) DO UPDATE SET profileId = excluded.profileId
  `).run(libraryId, provider, id)

  return {
    list() {
      const profiles = sqlite.prepare(`
        SELECT p.id, p.baseUrl, b.profileId IS NOT NULL AS selected
        FROM source_profiles.mediaServerProfiles p
        LEFT JOIN source_profiles.mediaServerBindings b ON b.profileId = p.id AND b.libraryId = ?
        WHERE p.provider = ? ORDER BY selected DESC, p.baseUrl
      `).all(libraryId, provider) as Array<Profile & {selected: number}>
      return profiles.filter(profile => vault.has(profile.id))
    },
    credential(baseUrl: string) {
      const profile = find(baseUrl)
      return profile && vault.has(profile.id) ? vault.get(profile.id).password || '' : ''
    },
    save(baseUrl: string, credential: string) {
      sqlite.transaction(() => {
        const profile = find(baseUrl)
        const id = profile?.id || randomUUID()
        if (!profile) sqlite.prepare('INSERT INTO source_profiles.mediaServerProfiles VALUES (?, ?, ?)').run(id, provider, normalize(baseUrl))
        if (credential) vault.set(id, {password: credential})
        bind(id)
      }).immediate()
    },
  }
}

export function mediaServerProfiles(db: ApiDb, provider: Provider) {
  if (!db.path_databases || !db.config?.id) return
  const attached = db.sqlite.pragma('database_list') as Array<{name: string}>
  if (!attached.some(entry => entry.name === 'source_profiles')) return
  return createMediaServerProfiles(db.sqlite, db.path_databases, db.config.id, provider)
}
