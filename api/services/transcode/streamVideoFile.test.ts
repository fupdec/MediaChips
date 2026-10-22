// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import {PassThrough} from 'stream'
import express from 'express'
import type {Server} from 'http'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {streamVideoFile} from './streamVideoFile'

describe('video HTTP streaming', () => {
  let directory: string
  let file: string
  let server: Server
  let base: string
  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-stream-'))
    file = path.join(directory, 'movie.mp4')
    fs.writeFileSync(file, '0123456789')
    const app = express()
    app.get('/video', (req, res) => streamVideoFile(req, res, file))
    server = await new Promise(resolve => {const s = app.listen(0, '127.0.0.1', () => resolve(s))})
    base = `http://127.0.0.1:${(server.address() as {port: number}).port}/video`
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(directory, {recursive: true, force: true})
  })
  it.each([['bytes=2-4', '234', 'bytes 2-4/10'], ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'], ['bytes=8-99', '89', 'bytes 8-9/10']])('serves %s for seeking', async (range, body, contentRange) => {
    const response = await fetch(base, {headers: {Range: range}})
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(contentRange)
    expect(await response.text()).toBe(body)
  })
  it.each(['bytes=10-', 'bytes=4-2', 'bytes=-0', 'bytes=1-2,4-5', 'garbage'])('rejects %s without opening a reader', async range => {
    const read = vi.spyOn(fs, 'createReadStream')
    const response = await fetch(base, {headers: {Range: range}})
    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe('bytes */10')
    expect(read).not.toHaveBeenCalled()
  })
  it('handles HEAD and empty files without creating an invalid reader', async () => {
    const read = vi.spyOn(fs, 'createReadStream')
    const head = await fetch(base, {method: 'HEAD'})
    expect(head.headers.get('content-length')).toBe('10')
    fs.writeFileSync(file, '')
    const empty = await fetch(base)
    expect(empty.status).toBe(200)
    expect(await empty.text()).toBe('')
    expect(read).not.toHaveBeenCalled()
  })
  it('delivers the first bytes before EOF, cancels reading on close and accepts a new range', async () => {
    const body = new PassThrough()
    const read = vi.spyOn(fs, 'createReadStream').mockReturnValueOnce(body as unknown as fs.ReadStream)
    const controller = new AbortController()
    const pending = fetch(base, {signal: controller.signal})
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1))
    body.write('012')
    const response = await pending
    const reader = response.body!.getReader()
    expect(Buffer.from((await reader.read()).value!).toString()).toBe('012')
    expect(body.readableEnded).toBe(false)
    controller.abort()
    await vi.waitFor(() => expect(body.destroyed).toBe(true))
    const retry = await fetch(base, {headers: {Range: 'bytes=3-'}})
    expect(await retry.text()).toBe('3456789')
  })
})
