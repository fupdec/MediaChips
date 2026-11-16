import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import {afterEach, expect, it, vi} from 'vitest'
import type {Express} from 'express'
import type {ApiDb} from '../../types/db'
import type {ApiRequest, ApiResponse} from '../../types/http'

vi.mock('../../../app/server/configFile', () => ({loadConfigFile: () => ({config: {databases: [{id: 'active'}, {id: 'other'}]}})}))
vi.mock('../../../app/server/databaseRegistry', () => ({getDatabaseManager: () => { throw new Error('Must not change the active connection') }}))
import controller from './TasksBackups.controller'
import {resolveBackupTarget} from '../../services/backupTarget'

let root = ''
let active: Database.Database | undefined
afterEach(() => { active?.close(); active = undefined; if (root) fs.rmSync(root, {recursive: true, force: true}) })

it('creates, lists, restores and deletes backups for an inactive database without touching the active one', async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-backup-target-'))
  for (const id of ['active', 'other']) {
    fs.mkdirSync(path.join(root, id))
    const sqlite = new Database(path.join(root, id, 'db.sqlite'))
    sqlite.exec(`CREATE TABLE media(id INTEGER PRIMARY KEY); INSERT INTO media VALUES(${id === 'active' ? 1 : 2})`)
    sqlite.close()
  }
  active = new Database(path.join(root, 'active', 'db.sqlite'))
  const db = {path: path.join(root, 'active'), path_databases: root, config: {id: 'active'}, sqlite: active} as ApiDb
  const handlers = controller({} as Express, db)
  const req = {query: {databaseId: 'other'}, body: {}} as unknown as ApiRequest
  const res = {sendStatus: vi.fn(), send: vi.fn(), json: vi.fn(), status: vi.fn().mockReturnThis()} as unknown as ApiResponse
  await handlers.createBackup(req, res)
  expect(res.sendStatus).toHaveBeenLastCalledWith(200)
  const files = fs.readdirSync(path.join(root, 'other', 'backups'))
  expect(files).toHaveLength(1)
  expect(fs.existsSync(path.join(root, 'active', 'backups'))).toBe(false)
  handlers.getBackups(req, res)
  expect(res.send).toHaveBeenLastCalledWith([expect.objectContaining({name: files[0]})])
  const other = new Database(path.join(root, 'other', 'db.sqlite'))
  other.exec('DELETE FROM media'); other.close()
  req.body = {name: path.parse(files[0]).name}
  await handlers.restoreBackup(req, res)
  expect(res.sendStatus).toHaveBeenLastCalledWith(200)
  expect(res.status).not.toHaveBeenCalledWith(500)
  const restored = new Database(path.join(root, 'other', 'db.sqlite'))
  try { expect(restored.prepare('SELECT id FROM media').all()).toEqual([{id: 2}]) } finally { restored.close() }
  expect(active.prepare('SELECT id FROM media').all()).toEqual([{id: 1}])
  expect(db.config?.id).toBe('active')
  expect(() => resolveBackupTarget(db, '../other')).toThrow('Database not found')
  const exported = path.join(root, 'exported')
  fs.mkdirSync(exported)
  req.body = {archive: path.parse(files[0]).name, path: exported}
  await handlers.exportBackup(req, res)
  expect(fs.existsSync(path.join(exported, files[0]))).toBe(true)
  fs.renameSync(path.join(exported, files[0]), path.join(exported, 'imported.zip'))
  req.body = {path: path.join(exported, 'imported.zip')}
  await handlers.importBackup(req, res)
  expect(fs.existsSync(path.join(root, 'other', 'backups', 'imported.zip'))).toBe(true)
  fs.unlinkSync(path.join(root, 'other', 'backups', 'imported.zip'))
  req.body = {name: path.parse(files[0]).name}
  handlers.deleteBackup(req, res)
  await vi.waitFor(() => expect(fs.readdirSync(path.join(root, 'other', 'backups'))).toEqual([]))
})
