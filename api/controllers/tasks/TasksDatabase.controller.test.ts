import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {ApiRequest, ApiResponse} from '../../types/http'

const mocks = vi.hoisted(() => ({
  configDatabases: [] as Array<Record<string, unknown>>,
  loadConfig: vi.fn(),
  copyDatabaseDirectory: vi.fn(),
  importLibrary: vi.fn(),
  machineId: vi.fn(),
}))

vi.mock('../../utils/appConfigPath', () => ({getAppConfigPath: () => '/fake/config.json'}))
vi.mock('../../../app/server/configFile', () => ({
  loadConfigFile: mocks.loadConfig,
  createDefaultConfig: () => ({databases: []}),
}))
vi.mock('../../services/duplicateDatabase', () => ({copyDatabaseDirectory: mocks.copyDatabaseDirectory}))
vi.mock('../../services/libraryMerge', () => ({importLibraryIntoActive: mocks.importLibrary}))
vi.mock('node-machine-id', () => ({machineId: mocks.machineId}))

import createTasksDatabaseController from './TasksDatabase.controller'

let root = ''
const write = (file: string, content = 'x') => {
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, content)
}

function createResponse() {
  const chunks: string[] = []
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    ended: false,
    headers: {} as Record<string, string>,
    status(code: number) { res.statusCode = code; return res },
    send(payload: unknown) { res.body = payload; return res },
    sendStatus(code: number) { res.statusCode = code; return res },
    setHeader(name: string, value: string) { res.headers[name] = value },
    write(chunk: string) { chunks.push(chunk) },
    end() { res.ended = true },
    on() { return res },
    writableFinished: true,
    events: () => chunks.join('').split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>),
  }
  return res as unknown as ApiResponse & {statusCode: number; body: unknown; ended: boolean; headers: Record<string, string>; events: () => Array<Record<string, unknown>>}
}

const request = (body: unknown = {}) => ({body, on: vi.fn()}) as unknown as ApiRequest

function build(overrides: Record<string, unknown> = {}) {
  const generated: Record<string, string | null> = {
    thumbs: path.join(root, 'generated', 'thumbs'),
    faces: path.join(root, 'generated', 'faces'),
  }
  const db = {
    path_databases: path.join(root, 'databases'),
    config: {id: 'active'},
    sqlite: {pragma: vi.fn(), prepare: vi.fn(() => ({run: vi.fn()}))},
    ...overrides,
  }
  const controller = createTasksDatabaseController({
    db,
    resolveGeneratedFolderPath: (type: string) => generated[String(type)] ?? null,
  } as never)
  return {controller, db, generated}
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-tasks-db-'))
  mocks.configDatabases = [{id: 'source', name: 'Source', active: false, icon: 'folder'}, {id: 'active', name: 'Main', active: true}]
  mocks.loadConfig.mockReset().mockImplementation(() => ({config: {databases: mocks.configDatabases}}))
  mocks.copyDatabaseDirectory.mockReset().mockResolvedValue(undefined)
  mocks.importLibrary.mockReset().mockResolvedValue({imported: 3})
  mocks.machineId.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true})
  vi.restoreAllMocks()
})

describe('deleteDb', () => {
  it('removes the database folder and nothing else', async () => {
    write(path.join(root, 'databases', 'old', 'db.sqlite'))
    write(path.join(root, 'databases', 'keep', 'db.sqlite'))
    const {controller} = build()
    const res = createResponse()
    await controller.deleteDb(request({id: 'old'}), res)
    expect(fs.existsSync(path.join(root, 'databases', 'old'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'databases', 'keep', 'db.sqlite'))).toBe(true)
    expect(res.statusCode).toBe(200)
  })
})

describe('deleteDb with unsafe ids', () => {
  it.each(['..', '.', '../outside', 'a/b', '/etc', ''])('refuses %j and deletes nothing', async (id) => {
    write(path.join(root, 'databases', 'keep', 'db.sqlite'))
    write(path.join(root, 'outside', 'precious.txt'))
    const res = createResponse()
    await build().controller.deleteDb(request({id}), res)
    expect(res.statusCode).toBe(400)
    expect(fs.existsSync(path.join(root, 'databases', 'keep', 'db.sqlite'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'outside', 'precious.txt'))).toBe(true)
  })

  it('refuses to delete anything when there is no databases folder configured', async () => {
    write(path.join(root, 'old', 'db.sqlite'))
    const cwd = process.cwd()
    process.chdir(root)
    try {
      const res = createResponse()
      await build({path_databases: ''}).controller.deleteDb(request({id: 'old'}), res)
      expect(res.statusCode).toBe(400)
      expect(fs.existsSync(path.join(root, 'old', 'db.sqlite'))).toBe(true)
    } finally {
      process.chdir(cwd)
    }
  })
})

describe('duplicateDb', () => {
  beforeEach(() => write(path.join(root, 'databases', 'source', 'db.sqlite')))

  it('requires a source id and a databases folder', async () => {
    const res = createResponse()
    await build().controller.duplicateDb(request({}), res)
    expect(res.statusCode).toBe(400)
    const noFolder = createResponse()
    await build({path_databases: ''}).controller.duplicateDb(request({id: 'source'}), noFolder)
    expect(noFolder.statusCode).toBe(400)
  })

  it('rejects a source folder that does not exist or is not in the config', async () => {
    const missingFolder = createResponse()
    await build().controller.duplicateDb(request({id: 'ghost'}), missingFolder)
    expect(missingFolder.body).toMatchObject({message: 'Source database folder not found'})

    write(path.join(root, 'databases', 'unlisted', 'db.sqlite'))
    const notInConfig = createResponse()
    await build().controller.duplicateDb(request({id: 'unlisted'}), notInConfig)
    expect(notInConfig.body).toMatchObject({message: 'Source database not found in config'})
    expect(mocks.copyDatabaseDirectory).not.toHaveBeenCalled()
  })

  it('copies into a new folder, names the copy and keeps the source icon', async () => {
    const res = createResponse()
    await build().controller.duplicateDb(request({id: 'source'}), res)
    const {database} = res.body as {database: Record<string, unknown>}
    expect(database).toMatchObject({name: 'Source (copy)', active: false, icon: 'folder'})
    expect(database.id).toMatch(/^[0-9a-f]+$/)
    expect(mocks.copyDatabaseDirectory).toHaveBeenCalledWith({
      sourceDir: path.join(root, 'databases', 'source'),
      destDir: path.join(root, 'databases', String(database.id)),
      includeGeneratedCache: true,
    })
  })

  it('honours a custom name and icon and the option to skip generated cache', async () => {
    const res = createResponse()
    await build().controller.duplicateDb(request({id: 'source', name: '  Backup  ', icon: ' star ', includeGeneratedCache: false}), res)
    expect((res.body as {database: Record<string, unknown>}).database).toMatchObject({name: 'Backup', icon: 'star'})
    expect(mocks.copyDatabaseDirectory).toHaveBeenCalledWith(expect.objectContaining({includeGeneratedCache: false}))
  })

  it('flushes the write-ahead log first when the source is the active library', async () => {
    write(path.join(root, 'databases', 'active', 'db.sqlite'))
    const {controller, db} = build()
    await controller.duplicateDb(request({id: 'active'}), createResponse())
    expect((db.sqlite as {pragma: ReturnType<typeof vi.fn>}).pragma).toHaveBeenCalledWith('wal_checkpoint(TRUNCATE)')
    const inactive = build()
    await inactive.controller.duplicateDb(request({id: 'source'}), createResponse())
    expect((inactive.db.sqlite as {pragma: ReturnType<typeof vi.fn>}).pragma).not.toHaveBeenCalled()
  })

  it('still copies when the checkpoint fails, and reports a failed copy as an error', async () => {
    write(path.join(root, 'databases', 'active', 'db.sqlite'))
    const failing = build({sqlite: {pragma: vi.fn(() => { throw new Error('locked') })}})
    const ok = createResponse()
    await failing.controller.duplicateDb(request({id: 'active'}), ok)
    expect(ok.statusCode).toBe(200)

    mocks.copyDatabaseDirectory.mockRejectedValueOnce(new Error('disk full'))
    const bad = createResponse()
    await build().controller.duplicateDb(request({id: 'source'}), bad)
    expect(bad.statusCode).toBe(400)
    expect(bad.body).toMatchObject({message: 'disk full'})
  })
})

describe('sizes', () => {
  it('reports size and backup archive count per database', async () => {
    write(path.join(root, 'databases', 'a', 'db.sqlite'), '12345')
    write(path.join(root, 'databases', 'a', 'backups', 'one.zip'), 'zz')
    write(path.join(root, 'databases', 'a', 'backups', 'two.zip'), 'zz')
    write(path.join(root, 'databases', 'a', 'backups', 'notes.txt'), 'zz')
    fs.mkdirSync(path.join(root, 'databases', 'b'), {recursive: true})
    const res = createResponse()
    await build().controller.getDatabaseSizes(request({ids: ['a', 'b', 7]}), res)
    const body = res.body as {sizes: Record<string, number>; backupCounts: Record<string, number>}
    expect(body.backupCounts).toEqual({a: 2, b: 0, 7: 0})
    expect(body.sizes.a).toBeGreaterThanOrEqual(5 + 4 + 6)
    expect(body.sizes.b).toBe(0)
  })

  it('does not measure folders outside the databases folder', async () => {
    write(path.join(root, 'outside', 'big.bin'), 'x'.repeat(5000))
    const res = createResponse()
    await build().controller.getDatabaseSizes(request({ids: ['..', '../outside', 'a/b']}), res)
    expect(res.body).toEqual({
      sizes: {'..': 0, '../outside': 0, 'a/b': 0},
      backupCounts: {'..': 0, '../outside': 0, 'a/b': 0},
    })
  })

  it('reports the size of a generated folder and rejects unknown folder types', async () => {
    const {controller, generated} = build()
    write(path.join(generated.thumbs!, 'a.jpg'), '123456')
    const res = createResponse()
    await controller.getFolderSize(request({folder: 'thumbs'}), res)
    expect((res.body as {size: number}).size).toBeGreaterThanOrEqual(6)
    const unknown = createResponse()
    await controller.getFolderSize(request({folder: 'nope'}), unknown)
    expect(unknown.statusCode).toBe(400)
  })
})

describe('clearData', () => {
  it('empties a generated folder but keeps (re-creates) the folder itself', async () => {
    const {controller, generated} = build()
    write(path.join(generated.thumbs!, 'a.jpg'))
    const res = createResponse()
    await controller.clearData(request({imageType: 'thumbs'}), res)
    expect(res.statusCode).toBe(200)
    expect(fs.existsSync(generated.thumbs!)).toBe(true)
    expect(fs.readdirSync(generated.thumbs!)).toEqual([])
  })

  it('also clears the faces table when clearing faces', async () => {
    const run = vi.fn()
    const prepare = vi.fn(() => ({run}))
    const {controller, generated} = build({sqlite: {prepare, pragma: vi.fn()}})
    write(path.join(generated.faces!, 'f.jpg'))
    await controller.clearData(request({imageType: 'faces'}), createResponse())
    expect(prepare).toHaveBeenCalledWith('DELETE FROM faces')
    expect(run).toHaveBeenCalled()
  })

  it('does not touch the faces table for other folder types', async () => {
    const prepare = vi.fn(() => ({run: vi.fn()}))
    const {controller} = build({sqlite: {prepare, pragma: vi.fn()}})
    await controller.clearData(request({imageType: 'thumbs'}), createResponse())
    expect(prepare).not.toHaveBeenCalled()
  })

  it('rejects unknown folder types without deleting anything', async () => {
    const res = createResponse()
    await build().controller.clearData(request({imageType: '../..'}), res)
    expect(res.statusCode).toBe(400)
  })
})

describe('getConfig and getMachineId', () => {
  it('returns the stored config, or a default one when none loads', async () => {
    const res = createResponse()
    await build().controller.getConfig(request(), res)
    expect(res.body).toEqual({databases: mocks.configDatabases})
    mocks.loadConfig.mockReturnValue({config: null})
    const fallback = createResponse()
    await build().controller.getConfig(request(), fallback)
    expect(fallback.body).toEqual({databases: []})
  })

  it('reports a config read failure as an error', async () => {
    mocks.loadConfig.mockImplementation(() => { throw new Error('unreadable') })
    const res = createResponse()
    await build().controller.getConfig(request(), res)
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })

  it('returns the machine id, or an error when it cannot be read', async () => {
    mocks.machineId.mockResolvedValueOnce('machine-1').mockRejectedValueOnce(new Error('no id'))
    const ok = createResponse()
    await build().controller.getMachineId(request(), ok)
    expect(ok.body).toBe('machine-1')
    const bad = createResponse()
    await build().controller.getMachineId(request(), bad)
    expect(bad.statusCode).toBeGreaterThanOrEqual(400)
  })
})

describe('streamMergeLibrary', () => {
  beforeEach(() => write(path.join(root, 'databases', 'source', 'db.sqlite')))

  async function run(body: unknown, overrides: Record<string, unknown> = {}) {
    const res = createResponse()
    await build(overrides).controller.streamMergeLibrary(request(body), res)
    return res
  }

  it('streams NDJSON with a starting event and a final summary', async () => {
    mocks.importLibrary.mockImplementation(async (_db: unknown, _id: string, _options: unknown, onProgress: (e: unknown) => void) => {
      onProgress({type: 'progress', phase: 'media', processed: 1, total: 3})
      return {imported: 3}
    })
    const res = await run({sourceDatabaseId: 'source'})
    expect(res.headers['Content-Type']).toContain('application/x-ndjson')
    expect(res.events()).toEqual([
      {type: 'progress', phase: 'starting', processed: 0, total: 0},
      {type: 'progress', phase: 'media', processed: 1, total: 3},
      {type: 'complete', imported: 3},
    ])
    expect(res.ended).toBe(true)
    expect(mocks.importLibrary).toHaveBeenCalledWith(expect.anything(), 'source', {copyGeneratedAssets: true}, expect.any(Function), expect.any(Function))
  })

  it.each([false, 0, '0'])('treats copyGeneratedAssets=%s as "do not copy"', async (value) => {
    await run({sourceDatabaseId: 'source', copyGeneratedAssets: value})
    expect(mocks.importLibrary).toHaveBeenLastCalledWith(expect.anything(), 'source', {copyGeneratedAssets: false}, expect.any(Function), expect.any(Function))
  })

  it('reports validation problems as error events and ends the stream', async () => {
    const cases: Array<[unknown, string, Record<string, unknown>?]> = [
      [{}, 'Source database id required'],
      [{sourceDatabaseId: 'active'}, 'Cannot import a library into itself'],
      [{sourceDatabaseId: 'unlisted'}, 'Source database not found in config'],
      [{sourceDatabaseId: 'source'}, 'Source database id required', {path_databases: ''}],
    ]
    for (const [body, message, overrides] of cases) {
      const res = await run(body, overrides)
      expect(res.events()).toEqual([expect.objectContaining({type: 'error', message})])
      expect(res.ended).toBe(true)
    }
    expect(mocks.importLibrary).not.toHaveBeenCalled()
  })

  it('reports a missing source database file', async () => {
    mocks.configDatabases.push({id: 'nofile', name: 'No file', active: false})
    fs.mkdirSync(path.join(root, 'databases', 'nofile'), {recursive: true})
    const res = await run({sourceDatabaseId: 'nofile'})
    expect(res.events()).toEqual([expect.objectContaining({type: 'error', message: 'Source database file not found'})])
  })

  it('turns an import failure into an error event instead of throwing', async () => {
    mocks.importLibrary.mockRejectedValue(new Error('schema mismatch'))
    const res = await run({sourceDatabaseId: 'source'})
    const events = res.events()
    expect(events[events.length - 1]).toEqual({type: 'error', message: 'schema mismatch'})
    expect(events.some((event) => event.type === 'complete')).toBe(false)
    expect(res.ended).toBe(true)
  })
})
