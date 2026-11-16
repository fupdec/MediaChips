import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import {afterEach, expect, it} from 'vitest'
import {createLibraryBackup, stageLibraryBackup, replaceLibraryFromStage} from './libraryBackup'

const dirs: string[] = []
const temp = () => { const p = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-backup-test-')); dirs.push(p); return p }
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, {recursive: true, force: true}) })

it('archives committed WAL data and assets, and restores after moving to another directory', async () => {
  const root = temp(), destination = temp()
  const db = new Database(path.join(root, 'db.sqlite'))
  try {
    db.pragma('journal_mode = WAL'); db.pragma('wal_autocheckpoint = 0')
    db.exec('CREATE TABLE media(id INTEGER PRIMARY KEY, path TEXT); INSERT INTO media VALUES(42, \'/Медиа/фильм.mp4\')')
    fs.mkdirSync(path.join(root, 'meta')); fs.writeFileSync(path.join(root, 'meta', 'asset'), 'image')
    const archive = path.join(root, 'backups', 'test.zip')
    await createLibraryBackup(db, root, archive)
    db.exec('DELETE FROM media')
    const stage = await stageLibraryBackup(archive, destination)
    await replaceLibraryFromStage(destination, stage, {close() {}, async reload() {}})
    const restored = new Database(path.join(destination, 'db.sqlite'))
    try { expect(restored.prepare('SELECT * FROM media').all()).toEqual([{id: 42, path: '/Медиа/фильм.mp4'}]) } finally { restored.close() }
    expect(fs.readFileSync(path.join(destination, 'meta', 'asset'), 'utf8')).toBe('image')
  } finally { db.close() }
})

it('retains the previous database and assets when opening the restored library fails', async () => {
  const root = temp(), stage = temp()
  fs.writeFileSync(path.join(root, 'db.sqlite'), 'previous')
  fs.mkdirSync(path.join(root, 'media')); fs.writeFileSync(path.join(root, 'media', 'asset'), 'previous asset')
  fs.writeFileSync(path.join(stage, 'db.sqlite'), 'replacement')
  let calls = 0
  await expect(replaceLibraryFromStage(root, stage, {close() {}, async reload() {
    if (++calls === 1) throw new Error('migration failed')
  }})).rejects.toThrow('migration failed')
  expect(calls).toBe(2)
  expect(fs.readFileSync(path.join(root, 'db.sqlite'), 'utf8')).toBe('previous')
  expect(fs.readFileSync(path.join(root, 'media', 'asset'), 'utf8')).toBe('previous asset')
})

it('rejects an invalid archive before replacing any live data', async () => {
  const root = temp(), db = new Database(':memory:')
  try {
    await createLibraryBackup(db, root, path.join(root, 'invalid.zip'))
    await expect(stageLibraryBackup(path.join(root, 'invalid.zip'), root)).rejects.toThrow('Invalid library')
    expect(fs.readdirSync(root)).toEqual(['invalid.zip'])
  } finally { db.close() }
})

it('waits for background writes before replacing assets and releases the barrier after rollback', async () => {
  const {runLibraryOperation, withLibraryRestore, isLibraryRestoring} = await import('./libraryMaintenance')
  const root = temp(), stage = temp()
  fs.writeFileSync(path.join(root, 'db.sqlite'), 'previous')
  fs.writeFileSync(path.join(stage, 'db.sqlite'), 'replacement')
  let finish!: () => void
  const worker = runLibraryOperation(() => new Promise<void>(resolve => { finish = resolve }))
  let calls = 0
  const restore = withLibraryRestore(() => replaceLibraryFromStage(root, stage, {
    close() { expect(isLibraryRestoring()).toBe(true) },
    async reload() { if (++calls === 1) throw new Error('cannot open restored library') },
  }))
  const rejected = expect(restore).rejects.toThrow('cannot open restored library')
  expect(fs.readFileSync(path.join(root, 'db.sqlite'), 'utf8')).toBe('previous')
  finish(); await worker; await rejected
  expect(fs.readFileSync(path.join(root, 'db.sqlite'), 'utf8')).toBe('previous')
  expect(isLibraryRestoring()).toBe(false)
})
