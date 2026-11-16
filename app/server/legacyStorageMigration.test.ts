/** @vitest-environment node */
import {afterEach, describe, expect, it, vi} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {assertLegacyLibraryAvailable, migrateLegacyDatabasesFolder} from './legacyStorageMigration'
import {initializeServerConfig} from './serverConfig'

const folders: string[] = []
const originalDataDir = process.env.MEDIA_CHIPS_DATA_DIR
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-legacy-'))
  folders.push(root)
  const library = path.join(root, 'databases', 'old-id')
  fs.mkdirSync(library, {recursive: true})
  fs.writeFileSync(path.join(library, 'db.sqlite'), 'legacy library bytes')
  fs.writeFileSync(path.join(library, 'db.sqlite-wal'), 'pending transactions')
  fs.mkdirSync(path.join(library, 'media'))
  fs.writeFileSync(path.join(library, 'media', 'image.jpg'), 'media bytes')
  return root
}
afterEach(() => {
  vi.restoreAllMocks()
  if (originalDataDir === undefined) delete process.env.MEDIA_CHIPS_DATA_DIR
  else process.env.MEDIA_CHIPS_DATA_DIR = originalDataDir
  for (const folder of folders.splice(0)) fs.rmSync(folder, {recursive: true, force: true})
})

describe('legacy storage migration', () => {
  it('copies the library and sidecars, retains the original and is safe on restart', () => {
    const root = fixture()
    migrateLegacyDatabasesFolder(root)
    for (const folder of ['app_storage', 'databases.pre-1.x-backup']) {
      expect(fs.readFileSync(path.join(root, folder, 'old-id', 'db.sqlite'), 'utf8')).toBe('legacy library bytes')
      expect(fs.readFileSync(path.join(root, folder, 'old-id', 'db.sqlite-wal'), 'utf8')).toBe('pending transactions')
      expect(fs.readFileSync(path.join(root, folder, 'old-id', 'media', 'image.jpg'), 'utf8')).toBe('media bytes')
    }
    fs.writeFileSync(path.join(root, 'app_storage', 'old-id', 'db.sqlite'), 'migrated bytes')
    migrateLegacyDatabasesFolder(root)
    expect(fs.readFileSync(path.join(root, 'app_storage', 'old-id', 'db.sqlite'), 'utf8')).toBe('migrated bytes')
  })

  it('refuses conflicting destination storage without changing either library', () => {
    const root = fixture()
    fs.mkdirSync(path.join(root, 'app_storage'))
    expect(() => migrateLegacyDatabasesFolder(root)).toThrow('conflicts')
    expect(fs.readFileSync(path.join(root, 'databases', 'old-id', 'db.sqlite'), 'utf8')).toBe('legacy library bytes')
    expect(fs.readdirSync(path.join(root, 'app_storage'))).toEqual([])
    expect(fs.readFileSync(path.join(root, 'legacy-storage-migration.log'), 'utf8')).toContain('ERROR')
  })

  it('does not publish a damaged copy or move the original', () => {
    const root = fixture()
    vi.spyOn(fs, 'cpSync').mockImplementation((_source, destination) => {
      fs.mkdirSync(path.join(String(destination), 'old-id'))
      fs.writeFileSync(path.join(String(destination), 'old-id', 'db.sqlite'), 'wrong bytes')
    })
    expect(() => migrateLegacyDatabasesFolder(root)).toThrow('verification failed')
    expect(fs.existsSync(path.join(root, 'app_storage'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'databases', 'old-id', 'db.sqlite'))).toBe(true)
  })

  it('stops when copying fails', () => {
    const root = fixture()
    vi.spyOn(fs, 'cpSync').mockImplementation(() => {throw new Error('access denied')})
    expect(() => migrateLegacyDatabasesFolder(root)).toThrow('access denied')
    expect(fs.existsSync(path.join(root, 'app_storage'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'databases', 'old-id', 'db.sqlite'))).toBe(true)
  })

  it('refuses a missing selected database when a retained legacy backup exists', () => {
    const root = fixture()
    migrateLegacyDatabasesFolder(root)
    expect(() => assertLegacyLibraryAvailable(root, path.join(root, 'app_storage', 'wrong-id'))).toThrow('missing')
    expect(() => assertLegacyLibraryAvailable(root, path.join(root, 'app_storage', 'old-id'))).not.toThrow()
  })

  it('recovers the existing library instead of activating a new default when config is missing', () => {
    const root = fixture()
    process.env.MEDIA_CHIPS_DATA_DIR = root
    const {config} = initializeServerConfig({getBestLocalIp: () => '127.0.0.1', getAllIps: () => []})
    expect(config.databases).toHaveLength(1)
    expect(config.databases[0]).toMatchObject({id: 'old-id', active: true})
    expect(config.path).toBe(path.join(root, 'app_storage', 'old-id'))
  })

  it('does not rewrite config or create a missing library after an ID mismatch', () => {
    const root = fixture()
    const configPath = path.join(root, 'config.json')
    const saved = JSON.stringify({databases: [{id: 'wrong-id', active: true}]})
    fs.writeFileSync(configPath, saved)
    process.env.MEDIA_CHIPS_DATA_DIR = root
    expect(() => initializeServerConfig({getBestLocalIp: () => '127.0.0.1', getAllIps: () => []})).toThrow('missing')
    expect(fs.readFileSync(configPath, 'utf8')).toBe(saved)
    expect(fs.existsSync(path.join(root, 'app_storage', 'wrong-id'))).toBe(false)
  })
})
