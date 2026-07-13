import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import archiver from 'archiver'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createApiDb } from '../createApiDb'
import {
  closeActiveConnection,
  createDrizzleClient,
  getActiveConnection,
} from '../db'
import { createMediaRepository } from '../db/repositories/media'
import createTasksMigrateFromLowDbController from '../controllers/tasks/TasksMigrateFromLowDb.controller'

async function writeZip(filePath: string, entries: Record<string, string>) {
  const staging = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mc-lowdb-zip-'))
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    for (const [name, contents] of Object.entries(entries)) {
      const entryPath = path.join(staging, name)
      await fs.promises.mkdir(path.dirname(entryPath), { recursive: true })
      await fs.promises.writeFile(entryPath, contents)
    }
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(filePath)
      const archive = archiver('zip')
      output.on('close', () => resolve())
      archive.on('error', reject)
      archive.pipe(output)
      for (const name of Object.keys(entries)) {
        archive.file(path.join(staging, name), { name })
      }
      void archive.finalize()
    })
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

describe('migrateFromLowDb', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-lowdb-migrate-'))
    closeActiveConnection()
  })

  afterEach(() => {
    closeActiveConnection()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('imports legacy media after restoreBackup closes the active connection', async () => {
    const dbFolder = path.join(tmpDir, 'db')
    const backupsFolder = path.join(dbFolder, 'backups')
    const sqlitePath = path.join(dbFolder, 'db.sqlite')
    fs.mkdirSync(backupsFolder, { recursive: true })
    fs.mkdirSync(path.join(dbFolder, 'media'), { recursive: true })
    fs.mkdirSync(path.join(dbFolder, 'meta'), { recursive: true })

    const backupPath = path.join(backupsFolder, 'legacy.zip')
    await writeZip(backupPath, {
      'dbs.json': JSON.stringify({
        folders: [],
        metaAssignedToVideos: [{ id: 'genre' }],
      }),
      'databases/dbv.json': JSON.stringify({
        videos: [{
          id: 42,
          path: '/videos/sample.mp4',
          size: 1024,
          date: '2020-01-02',
          edit: '2020-01-03',
          resolution: '1280x720',
          duration: 12,
          rating: 5,
        }],
      }),
      'databases/dbpl.json': JSON.stringify({ playlists: [] }),
      'databases/dbm.json': JSON.stringify({ markers: [] }),
      'databases/meta.json': JSON.stringify({
        meta: [{
          id: 'genre',
          type: 'simple',
          dataType: 'array',
          date: '2020-01-01',
          edit: '2020-01-01',
          settings: {
            name: 'Genre',
            icon: 'tag',
            items: [{ id: 'action', name: 'Action' }],
          },
        }],
        cards: [],
      }),
    })

    // Mimic restoreBackup: ApiDb proxies are created, then the live connection is closed.
    const db = createApiDb({
      drizzleConnection: createDrizzleClient(sqlitePath),
      path: dbFolder,
    })
    closeActiveConnection()
    expect(getActiveConnection()).toBeNull()

    const controller = createTasksMigrateFromLowDbController(db)
    await controller.migrateFromLowDb(backupPath)

    expect(getActiveConnection()).not.toBeNull()
    const mediaRepo = createMediaRepository(db.drizzle)
    const media = mediaRepo.findAllRaw()
    expect(media).toHaveLength(1)
    expect(media[0]?.path).toBe('/videos/sample.mp4')
    expect(media[0]?.oldId).toBe('42')
  })

  it('imports when metaAssignedToVideos is missing from legacy settings', async () => {
    const dbFolder = path.join(tmpDir, 'db-missing-assign')
    const backupsFolder = path.join(dbFolder, 'backups')
    const sqlitePath = path.join(dbFolder, 'db.sqlite')
    fs.mkdirSync(backupsFolder, { recursive: true })
    fs.mkdirSync(path.join(dbFolder, 'media'), { recursive: true })
    fs.mkdirSync(path.join(dbFolder, 'meta'), { recursive: true })

    const backupPath = path.join(backupsFolder, 'legacy.zip')
    await writeZip(backupPath, {
      'dbs.json': JSON.stringify({ folders: [] }),
      'databases/dbv.json': JSON.stringify({
        videos: [{
          id: 'v1',
          path: '/videos/other.mp4',
          size: 1,
          date: '',
          edit: null,
          resolution: '100x100',
        }],
      }),
      'databases/dbpl.json': JSON.stringify({ playlists: [] }),
      'databases/dbm.json': JSON.stringify({ markers: [] }),
      'databases/meta.json': JSON.stringify({ meta: [], cards: [] }),
    })

    const db = createApiDb({
      drizzleConnection: createDrizzleClient(sqlitePath),
      path: dbFolder,
    })
    closeActiveConnection()

    const controller = createTasksMigrateFromLowDbController(db)
    await controller.migrateFromLowDb(backupPath)

    const mediaRepo = createMediaRepository(db.drizzle)
    expect(mediaRepo.findAllRaw()).toHaveLength(1)
  })
})
