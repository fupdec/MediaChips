import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {Request, Response} from 'express'
import type {ServerConfig} from '../types/server'
import {createFileResolver, isClientAbortError, safeJsonError} from './fileResolver'

let root = ''

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-file-resolver-'))
})

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true})
})

function write(relative: string, content = 'x'): string {
  const full = path.join(root, relative)
  fs.mkdirSync(path.dirname(full), {recursive: true})
  fs.writeFileSync(full, content)
  return full
}

function resolverFor(databases: Array<{id: string; active: boolean}>) {
  const config = {
    port: 0,
    databases: databases.map((db) => ({...db, name: db.id})),
  } as ServerConfig
  const resolver = createFileResolver({config, databasesPath: path.join(root, 'databases')})
  resolver.clearResolvedPathCache()
  return resolver
}

describe('getStreamContentType', () => {
  const {getStreamContentType} = resolverFor([])

  it('maps known media extensions case-insensitively', () => {
    expect(getStreamContentType('/a/clip.MP4')).toBe('video/mp4')
    expect(getStreamContentType('/a/clip.mkv')).toBe('video/x-matroska')
    expect(getStreamContentType('/a/song.flac')).toBe('audio/flac')
  })

  it('falls back to octet-stream for unknown or missing extensions', () => {
    expect(getStreamContentType('/a/file.xyz')).toBe('application/octet-stream')
    expect(getStreamContentType('/a/noext')).toBe('application/octet-stream')
  })
})

describe('resolveFilePath', () => {
  it('returns null for empty input and for files that do not exist', () => {
    const {resolveFilePath} = resolverFor([])
    expect(resolveFilePath(null)).toBeNull()
    expect(resolveFilePath(undefined)).toBeNull()
    expect(resolveFilePath('')).toBeNull()
    expect(resolveFilePath(path.join(root, 'nope.mp4'))).toBeNull()
  })

  it('resolves an existing absolute path, including a quoted one', () => {
    const file = write('library/clip.mp4')
    const {resolveFilePath} = resolverFor([])
    expect(resolveFilePath(file)).toBe(file)
    expect(resolveFilePath(`"${file}"`)).toBe(file)
  })

  it('finds a relative path under the media folder of the active database', () => {
    const file = write('databases/aaaaaaaaaaaa/media/videos/clip.mp4')
    const {resolveFilePath} = resolverFor([{id: 'aaaaaaaaaaaa', active: true}])
    expect(resolveFilePath('videos/clip.mp4')).toBe(file)
  })

  it('finds a file stored directly in the database folder and in its meta folder', () => {
    const direct = write('databases/aaaaaaaaaaaa/thumbs/a.jpg')
    const meta = write('databases/aaaaaaaaaaaa/meta/7/main.jpg')
    const {resolveFilePath} = resolverFor([{id: 'aaaaaaaaaaaa', active: true}])
    expect(resolveFilePath('thumbs/a.jpg')).toBe(direct)
    expect(resolveFilePath('7/main.jpg')).toBe(meta)
  })

  it('strips a stale databases/<id>/ prefix before looking inside the database folder', () => {
    const file = write('databases/aaaaaaaaaaaa/media/videos/clip.mp4')
    const {resolveFilePath} = resolverFor([{id: 'aaaaaaaaaaaa', active: true}])
    expect(resolveFilePath('/old/place/databases/bbbbbbbbbbbb/videos/clip.mp4')).toBe(file)
  })

  it('prefers the active database over the others', () => {
    write('databases/aaaaaaaaaaaa/media/same.jpg', 'inactive')
    const active = write('databases/bbbbbbbbbbbb/media/same.jpg', 'active')
    const {resolveFilePath} = resolverFor([
      {id: 'aaaaaaaaaaaa', active: false},
      {id: 'bbbbbbbbbbbb', active: true},
    ])
    expect(resolveFilePath('same.jpg')).toBe(active)
  })

  it('falls back to inactive databases when the active one has no such file', () => {
    const other = write('databases/aaaaaaaaaaaa/media/only-here.jpg')
    const {resolveFilePath} = resolverFor([
      {id: 'aaaaaaaaaaaa', active: false},
      {id: 'bbbbbbbbbbbb', active: true},
    ])
    expect(resolveFilePath('only-here.jpg')).toBe(other)
  })

  it('stops finding a file after it is removed and the cache is cleared', () => {
    const file = write('library/gone.mp4')
    const resolver = resolverFor([])
    expect(resolver.resolveFilePath(file)).toBe(file)
    fs.rmSync(file)
    resolver.clearResolvedPathCache()
    expect(resolver.resolveFilePath(file)).toBeNull()
  })
})

describe('isClientAbortError', () => {
  it('recognises connection-level abort codes and the aborted-request message', () => {
    for (const code of ['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ERR_STREAM_WRITE_AFTER_END']) {
      expect(isClientAbortError(Object.assign(new Error('x'), {code}))).toBe(true)
    }
    expect(isClientAbortError(new Error('Request aborted'))).toBe(true)
  })

  it('rejects other errors and empty values', () => {
    expect(isClientAbortError(Object.assign(new Error('x'), {code: 'ENOENT'}))).toBe(false)
    expect(isClientAbortError(new Error('boom'))).toBe(false)
    expect(isClientAbortError(null)).toBe(false)
    expect(isClientAbortError(undefined)).toBe(false)
  })
})

describe('safeJsonError', () => {
  function fakeResponse(state: {writableEnded?: boolean; headersSent?: boolean} = {}) {
    const sent: Array<{status: number; body: unknown}> = []
    const res = {
      writableEnded: Boolean(state.writableEnded),
      headersSent: Boolean(state.headersSent),
      status(code: number) {
        return {json: (body: unknown) => { sent.push({status: code, body}) }}
      },
    } as unknown as Response
    return {res, sent}
  }

  it('sends the status and payload on a live response', () => {
    const {res, sent} = fakeResponse()
    safeJsonError(res, {aborted: false} as Request, 404, {error: 'missing'})
    expect(sent).toEqual([{status: 404, body: {error: 'missing'}}])
  })

  it('does nothing when the request was aborted or the response is already finished', () => {
    const aborted = fakeResponse()
    safeJsonError(aborted.res, {aborted: true} as Request, 500, {error: 'x'})
    const ended = fakeResponse({writableEnded: true})
    safeJsonError(ended.res, {aborted: false} as Request, 500, {error: 'x'})
    const started = fakeResponse({headersSent: true})
    safeJsonError(started.res, {aborted: false} as Request, 500, {error: 'x'})
    expect(aborted.sent).toEqual([])
    expect(ended.sent).toEqual([])
    expect(started.sent).toEqual([])
  })
})
