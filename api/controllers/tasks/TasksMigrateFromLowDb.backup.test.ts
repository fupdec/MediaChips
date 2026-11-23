import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import type {ApiDb} from '../../types/db'
import type {ApiRequest, ApiResponse} from '../../types/http'
import controller from './TasksMigrateFromLowDb.controller'

let root = ''
let previousAppFolder: string | undefined

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-lowdb-backup-'))
  previousAppFolder = process.app_folder
  const userfiles = path.join(root, 'userfiles')
  fs.mkdirSync(path.join(userfiles, 'databases'), {recursive: true})
  fs.mkdirSync(path.join(userfiles, 'media'), {recursive: true})
  fs.writeFileSync(path.join(userfiles, 'dbs.json'), '[]')
  process.app_folder = root
})

afterEach(() => {
  process.app_folder = previousAppFolder
  fs.rmSync(root, {recursive: true, force: true})
})

function mockResponse() {
  let respond!: () => void
  const responded = new Promise<void>(resolve => { respond = resolve })
  const res = {
    sendStatus: vi.fn(() => { respond(); return res }),
    send: vi.fn(() => { respond(); return res }),
    status: vi.fn((_code: number) => res),
  }
  return {res: res as unknown as ApiResponse & typeof res, responded}
}

const request = {body: {}} as unknown as ApiRequest
const timeout = (ms: number) => new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), ms))

it('creates the legacy backup archive', async () => {
  const dbPath = path.join(root, 'library')
  fs.mkdirSync(path.join(dbPath, 'backups'), {recursive: true})
  const {res, responded} = mockResponse()
  await controller({path: dbPath} as ApiDb).createBackupLowDb(request, res)
  expect(await Promise.race([responded, timeout(5000)])).not.toBe('timeout')
  expect(res.status).toHaveBeenCalledWith(200)
  expect(fs.readdirSync(path.join(dbPath, 'backups'))).toHaveLength(1)
})

it('answers with an error instead of crashing when the backup file cannot be written', async () => {
  // The library has no backups folder, so the archive file cannot be created.
  const dbPath = path.join(root, 'library')
  fs.mkdirSync(dbPath, {recursive: true})
  const {res, responded} = mockResponse()
  await controller({path: dbPath} as ApiDb).createBackupLowDb(request, res)
  expect(await Promise.race([responded, timeout(5000)])).not.toBe('timeout')
  expect(res.status).toHaveBeenCalledTimes(1)
  const [status] = res.status.mock.calls[0] as unknown as [number]
  expect(status).toBeGreaterThanOrEqual(400)
})
