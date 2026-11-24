import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {randomUUID} from 'node:crypto'
import type {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import Database from 'better-sqlite3'
import archiver from 'archiver'
import StreamZip from 'node-stream-zip'

/** SQLite's online backup includes committed WAL pages without copying live sidecars. */
export async function createLibraryBackup(sqlite: Database.Database, root: string, destination: string) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-backup-'))
  const partial = `${destination}.${randomUUID()}.partial`
  try {
    await sqlite.backup(path.join(temporary, 'db.sqlite'))
    fs.mkdirSync(path.dirname(destination), {recursive: true})
    const archive = archiver('zip')
    const completed = pipeline(archive as unknown as Readable, fs.createWriteStream(partial, {flags: 'wx'}))
    for (const name of ['media', 'meta']) {
      if (fs.existsSync(path.join(root, name))) archive.directory(path.join(root, name), name)
    }
    archive.file(path.join(temporary, 'db.sqlite'), {name: 'db.sqlite'})
    await Promise.all([archive.finalize(), completed])
    fs.renameSync(partial, destination)
  } finally {
    fs.rmSync(partial, {force: true})
    fs.rmSync(temporary, {recursive: true, force: true})
  }
}

/** Extract and validate before the caller closes any live connection. */
export async function stageLibraryBackup(archive: string, parent: string): Promise<string> {
  const stage = fs.mkdtempSync(path.join(parent, '.restore-'))
  const zip = new StreamZip.async({file: archive})
  try {
    const entries = Object.values(await zip.entries())
    for (const entry of entries) {
      const parts = entry.name.replace(/\\/g, '/').split('/')
      if (parts.some(p => p === '..') || !['db.sqlite', 'media', 'meta'].includes(parts[0])
        || (parts[0] === 'db.sqlite' && parts.length !== 1)) throw new Error('Unexpected backup entry')
    }
    await zip.extract(null, stage)
    const check = new Database(path.join(stage, 'db.sqlite'), {readonly: true, fileMustExist: true})
    try {
      if (check.pragma('integrity_check', {simple: true}) !== 'ok'
        || !check.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='media'").get()) {
        throw new Error('Invalid library database')
      }
    } finally { check.close() }
    return stage
  } catch (error) {
    fs.rmSync(stage, {recursive: true, force: true})
    throw error
  } finally { await zip.close() }
}

/** Keep the previous files until the restored database has opened successfully. */
export async function replaceLibraryFromStage(root: string, stage: string, lifecycle: {
  close: () => void; reload: () => Promise<unknown>
}) {
  const rollback = fs.mkdtempSync(path.join(root, '.restore-previous-'))
  const names = ['db.sqlite', 'db.sqlite-wal', 'db.sqlite-shm', 'media', 'meta']
  const moved: string[] = [], installed: string[] = []
  lifecycle.close()
  try {
    for (const name of names) if (fs.existsSync(path.join(root, name))) {
      fs.renameSync(path.join(root, name), path.join(rollback, name)); moved.push(name)
    }
    for (const name of ['db.sqlite', 'media', 'meta']) if (fs.existsSync(path.join(stage, name))) {
      fs.renameSync(path.join(stage, name), path.join(root, name)); installed.push(name)
    }
    await lifecycle.reload()
  } catch (error) {
    lifecycle.close()
    for (const name of new Set([...installed, ...(installed.includes('db.sqlite') ? ['db.sqlite-wal', 'db.sqlite-shm'] : [])])) fs.rmSync(path.join(root, name), {recursive: true, force: true})
    for (const name of moved) fs.renameSync(path.join(rollback, name), path.join(root, name))
    await lifecycle.reload()
    throw error
  } finally {
    fs.rmSync(stage, {recursive: true, force: true})
    // A process crash leaves this directory available for manual recovery.
    if (fs.readdirSync(rollback).length === 0) fs.rmSync(rollback, {recursive: true, force: true})
  }
  fs.rmSync(rollback, {recursive: true, force: true})
}
