// @vitest-environment node
import {beforeEach, expect, it, vi} from 'vitest'
import type {Express} from 'express'
import type {ApiDb} from '../../types/db'
import type {ApiRequest, ApiResponse} from '../../types/http'
import {isLibraryRestoring, runLibraryOperation} from '../../services/libraryMaintenance'
const mocks = vi.hoisted(() => ({stage: vi.fn(), replace: vi.fn(), reload: vi.fn(), legacy: vi.fn(), entries: vi.fn()}))
vi.mock('../../services/libraryBackup', () => ({createLibraryBackup: vi.fn(), stageLibraryBackup: mocks.stage, replaceLibraryFromStage: mocks.replace}))
vi.mock('../../../app/server/databaseRegistry', () => ({getDatabaseManager: () => ({closeConnection: vi.fn(), reloadCurrentDatabase: mocks.reload})}))
vi.mock('./TasksMigrateFromLowDb.controller', () => ({default: () => ({migrateFromLowDb: mocks.legacy})}))
vi.mock('node-stream-zip', () => ({default: {async: class {entries = mocks.entries; close = vi.fn().mockResolvedValue(undefined)}}}))
import createController from './TasksBackups.controller'
const request = {body: {name: 'copy'}} as ApiRequest
const response = () => {
  const res = {status: vi.fn(), send: vi.fn(), json: vi.fn(), sendStatus: vi.fn(() => {expect(isLibraryRestoring()).toBe(false)})}
  res.status.mockReturnValue(res)
  return res as unknown as ApiResponse
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.entries.mockResolvedValue({'db.sqlite': {name: 'db.sqlite'}})
  mocks.stage.mockResolvedValue('/test/stage')
  mocks.reload.mockResolvedValue(undefined)
  mocks.legacy.mockResolvedValue(undefined)
  mocks.replace.mockResolvedValue(undefined)
})

it('drains work before opening the archive and rejects a second restore', async () => {
  const controller = createController({} as Express, {path: '/test'} as ApiDb)
  let finish!: () => void, replace!: () => void
  const work = runLibraryOperation(() => new Promise<void>(resolve => {finish = resolve}))
  mocks.replace.mockImplementation(() => new Promise<void>(resolve => {replace = resolve}))
  const res = response()
  const restoring = controller.restoreBackup(request, res)
  expect(isLibraryRestoring()).toBe(true)
  expect(mocks.entries).not.toHaveBeenCalled()
  const second = response()
  await controller.restoreBackup(request, second)
  expect(second.status).toHaveBeenCalledWith(409)
  finish(); await work
  await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1))
  expect(isLibraryRestoring()).toBe(true)
  replace(); await restoring
  expect(res.sendStatus).toHaveBeenCalledWith(200)
})

it('releases the barrier after failed replacement and recovery', async () => {
  const controller = createController({} as Express, {path: '/test'} as ApiDb)
  mocks.replace.mockRejectedValue(new Error('replacement failed'))
  await controller.restoreBackup(request, response())
  expect(mocks.reload).toHaveBeenCalledTimes(1)
  expect(isLibraryRestoring()).toBe(false)
  await expect(runLibraryOperation(async () => 1)).resolves.toBe(1)
})

it('holds the same barrier during legacy LowDB import', async () => {
  const controller = createController({} as Express, {path: '/test'} as ApiDb)
  mocks.entries.mockResolvedValue({'dbs.json': {name: 'dbs.json'}})
  mocks.legacy.mockImplementation(async () => {expect(isLibraryRestoring()).toBe(true)})
  const res = response()
  await controller.restoreBackup(request, res)
  expect(mocks.legacy).toHaveBeenCalledTimes(1)
  expect(mocks.stage).not.toHaveBeenCalled()
  expect(res.sendStatus).toHaveBeenCalledWith(200)
})
