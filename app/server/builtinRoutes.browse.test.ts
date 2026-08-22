import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {createServer} from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {ApiDb} from '../../api/types/db'
import type {BuiltinRoutesOptions} from '../types/builtinRoutes'
import {createExpressApp} from './createApp'
import {registerBuiltinRoutes} from './builtinRoutes'
import {createAuthMiddleware} from './auth'

type TestServer = {
  baseUrl: string
  close: () => Promise<void>
}

let mediaRoot = ''
let previousMediaRoots: string | undefined

beforeEach(() => {
  previousMediaRoots = process.env.MEDIA_CHIPS_MEDIA_ROOTS
  mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-browse-routes-'))
  process.env.MEDIA_CHIPS_MEDIA_ROOTS = mediaRoot
})

afterEach(() => {
  if (previousMediaRoots === undefined) {
    delete process.env.MEDIA_CHIPS_MEDIA_ROOTS
  } else {
    process.env.MEDIA_CHIPS_MEDIA_ROOTS = previousMediaRoots
  }
  fs.rmSync(mediaRoot, {recursive: true, force: true})
})

async function startServer(authRequired = false): Promise<TestServer> {
  const {app, router} = createExpressApp()
  if (authRequired) {
    const authService = {
      isAuthRequired: async () => true,
      isRequestAuthenticated: () => false,
    } as Parameters<typeof createAuthMiddleware>[0]
    app.use(createAuthMiddleware(authService))
  }

  registerBuiltinRoutes({
    app,
    router,
    config: {port: 0, databases: []},
    configPath: path.join(mediaRoot, 'config.json'),
    databasesPath: path.join(mediaRoot, 'databases'),
    db: {} as ApiDb,
    routeLoadErrors: [],
    resolveFilePath: () => null,
    getStreamContentType: () => 'application/octet-stream',
    transcodeManager: null,
  } satisfies BuiltinRoutesOptions)

  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to resolve test server port')

  return {
    baseUrl: 'http://127.0.0.1:' + address.port,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    }),
  }
}

function post(server: TestServer, endpoint: string, body: unknown): Promise<Response> {
  return fetch(server.baseUrl + endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  })
}

describe.sequential('builtin browse operation routes', () => {
  it('performs create, rename, copy, move, and delete against the filesystem', async () => {
    const server = await startServer()
    const source = path.join(mediaRoot, 'source.txt')
    const copies = path.join(mediaRoot, 'copies')
    const moved = path.join(mediaRoot, 'moved')
    fs.writeFileSync(source, 'original')
    fs.mkdirSync(copies)
    fs.mkdirSync(moved)

    try {
      const folder = path.join(mediaRoot, 'created')
      const createResponse = await post(server, '/api/browse/createFolder', {path: folder})
      expect(createResponse.status).toBe(200)
      await expect(createResponse.json()).resolves.toEqual({created: folder})
      expect(fs.statSync(folder).isDirectory()).toBe(true)

      const renameResponse = await post(server, '/api/browse/renameEntry', {path: source, name: 'renamed.txt'})
      const renamed = path.join(mediaRoot, 'renamed.txt')
      expect(renameResponse.status).toBe(200)
      await expect(renameResponse.json()).resolves.toEqual({renamed})
      expect(fs.readFileSync(renamed, 'utf8')).toBe('original')

      const copyResponse = await post(server, '/api/browse/copyEntries', {entries: [{path: renamed, name: 'renamed.txt'}], destination: copies})
      expect(copyResponse.status).toBe(200)
      await expect(copyResponse.json()).resolves.toEqual({copied: [renamed], failed: []})
      const copied = path.join(copies, 'renamed.txt')
      expect(fs.readFileSync(copied, 'utf8')).toBe('original')

      const moveResponse = await post(server, '/api/browse/moveEntries', {entries: [{path: copied, name: 'renamed.txt'}], destination: moved})
      expect(moveResponse.status).toBe(200)
      await expect(moveResponse.json()).resolves.toEqual({moved: [copied], failed: []})
      const movedFile = path.join(moved, 'renamed.txt')
      expect(fs.existsSync(copied)).toBe(false)
      expect(fs.existsSync(movedFile)).toBe(true)

      const deleteResponse = await post(server, '/api/browse/deleteEntries', {entries: [{path: movedFile, name: 'renamed.txt'}]})
      expect(deleteResponse.status).toBe(200)
      await expect(deleteResponse.json()).resolves.toEqual({deleted: [movedFile], failed: []})
      expect(fs.existsSync(movedFile)).toBe(false)
    } finally {
      await server.close()
    }
  })

  it('returns 400 for invalid browse operation input', async () => {
    const server = await startServer()
    try {
      const missingPath = await post(server, '/api/browse/createFolder', {})
      expect(missingPath.status).toBe(400)
      await expect(missingPath.json()).resolves.toMatchObject({message: 'Path is required'})

      const invalidEntries = await post(server, '/api/browse/deleteEntries', {entries: []})
      expect(invalidEntries.status).toBe(400)
      await expect(invalidEntries.json()).resolves.toMatchObject({message: expect.stringMatching(/Entries array is required/)})
    } finally {
      await server.close()
    }
  })

  it('reports partial batch failures while deleting valid entries', async () => {
    const server = await startServer()
    const present = path.join(mediaRoot, 'present.txt')
    const missing = path.join(mediaRoot, 'missing.txt')
    fs.writeFileSync(present, 'delete me')
    try {
      const response = await post(server, '/api/browse/deleteEntries', {
        entries: [
          {path: missing, name: 'missing.txt'},
          {path: present, name: 'present.txt'},
        ],
      })
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        deleted: [present],
        failed: [{path: missing, reason: expect.any(String)}],
      })
      expect(fs.existsSync(present)).toBe(false)
    } finally {
      await server.close()
    }
  })

  it('returns 409 when renaming over an existing entry', async () => {
    const server = await startServer()
    const source = path.join(mediaRoot, 'source.txt')
    fs.writeFileSync(source, 'source')
    fs.writeFileSync(path.join(mediaRoot, 'taken.txt'), 'taken')
    try {
      const response = await post(server, '/api/browse/renameEntry', {path: source, name: 'taken.txt'})
      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({message: expect.stringMatching(/already exists/)})
      expect(fs.existsSync(source)).toBe(true)
    } finally {
      await server.close()
    }
  })

  it('returns 401 for browse routes when authentication is required', async () => {
    const server = await startServer(true)
    try {
      const response = await post(server, '/api/browse/createFolder', {path: path.join(mediaRoot, 'blocked')})
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({message: 'Authentication required'})
      expect(fs.existsSync(path.join(mediaRoot, 'blocked'))).toBe(false)
    } finally {
      await server.close()
    }
  })
})
