// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import {createHash} from 'crypto'
import {Readable} from 'stream'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import type {OriginalItem} from '../../../shared/originalOperations'
import {createLocalOriginalAdapter} from '../mediaSources/localAdapter'
import {resumableCopy, RESUME_BLOCK_SIZE as block} from './resumableCopy'

let directory: string, source: string, destination: string, item: OriginalItem, saved: OriginalItem
let fail: boolean, ignoreRange: boolean, allowResume: boolean, lostReply: boolean
let ranges: Array<string | undefined>
const payload = Buffer.concat([Buffer.alloc(block, 31), Buffer.alloc(block, 79), Buffer.from('final bytes')])
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-resume-'))
  source = path.join(directory, 'source.mp4'); destination = path.join(directory, '.owned.part')
  fs.writeFileSync(source, payload)
  item = {id: 'copy', kind: 'download', conflict: 'fail', state: 'running', phase: 'prepared', bytes: 0, total: payload.length}
  fail = true; ignoreRange = false; allowResume = true; lostReply = false; ranges = []
})
afterEach(() => fs.rmSync(directory, {recursive: true, force: true}))
const copy = () => resumableCopy({item, source: {key: source}, destination: {key: destination}, signal: new AbortController().signal,
  guard: () => {}, save: () => { saved = JSON.parse(JSON.stringify(item)) }, progress: bytes => { item.bytes = bytes },
  open: async ref => {
    const adapter = createLocalOriginalAdapter()
    if (ref.key === source) {
      const read = adapter.read.bind(adapter)
      adapter.read = async (key, range, signal) => {
        ranges.push(range)
        if (!fail) return read(key, ignoreRange ? undefined : range, signal)
        return {status: 200, headers: {}, body: Readable.from((async function* () {
          for (let position = 0; position < block + 1024 * 1024; position += 1024 * 1024) {
            yield payload.subarray(position, position + 1024 * 1024)
            await new Promise(resolve => setImmediate(resolve))
          }
          // Let the local writer finish its queued chunk before simulating a socket failure.
          await new Promise(resolve => setTimeout(resolve, 20))
          throw new Error('Disconnected')
        })())}
      }
    } else {
      if (!allowResume) delete adapter.resumeWrite
      const write = adapter.write!.bind(adapter)
      adapter.write = async (...args) => { await write(...args); if (lostReply) throw new Error('Lost reply') }
    }
    return adapter
  },
})

describe('durable byte continuation', () => {
  it('recovers serialized checkpoints and downloads only the tail, truncating unconfirmed bytes', async () => {
    await expect(copy()).rejects.toThrow('Disconnected')
    expect(saved.resume).toMatchObject({bytes: block, blocks: [expect.any(String)]})
    expect(fs.statSync(destination).size).toBeGreaterThanOrEqual(block)
    item = JSON.parse(JSON.stringify(saved)); fail = false
    expect(await copy()).toBe(createHash('sha256').update(payload).digest('hex'))
    expect(ranges).toEqual([undefined, `bytes=${block}-${payload.length - 1}`])
    expect(fs.readFileSync(destination).equals(payload)).toBe(true)
  })
  it('rejects a changed source of the same size before reading or modifying the staging file', async () => {
    await expect(copy()).rejects.toThrow()
    const prior = fs.readFileSync(destination)
    fs.writeFileSync(source, Buffer.alloc(payload.length, 3)); fail = false
    await expect(copy()).rejects.toMatchObject({code: 'source_changed'})
    expect(ranges).toEqual([undefined]); expect(fs.readFileSync(destination).equals(prior)).toBe(true)
  })
  it('detects corrupt retained bytes instead of mixing them with a new tail', async () => {
    await expect(copy()).rejects.toThrow()
    const handle = fs.openSync(destination, 'r+'); fs.writeSync(handle, Buffer.from('wrong'), 0, 5, 0); fs.closeSync(handle)
    fail = false
    await expect(copy()).rejects.toMatchObject({code: 'size_mismatch'})
    expect(ranges).toEqual([undefined])
  })
  it('reuses a complete short final block after a lost write acknowledgment', async () => {
    fail = false; lostReply = true
    await expect(copy()).rejects.toThrow('Lost reply')
    item = JSON.parse(JSON.stringify(saved)); lostReply = false
    expect(await copy()).toBe(createHash('sha256').update(payload).digest('hex'))
    expect(ranges).toEqual([undefined])
  })
  it('falls back to a complete fresh copy if the source ignores Range', async () => {
    await expect(copy()).rejects.toThrow()
    fail = false; ignoreRange = true
    await copy()
    expect(ranges).toEqual([undefined, `bytes=${block}-${payload.length - 1}`, undefined])
    expect(fs.readFileSync(destination).equals(payload)).toBe(true)
  })
  it('restarts transports without positional writes and safely discards a truncated checkpoint', async () => {
    await expect(copy()).rejects.toThrow()
    fail = false; allowResume = false
    await copy()
    expect(ranges).toEqual([undefined, undefined])
    expect(fs.readFileSync(destination).equals(payload)).toBe(true)
  })
  it('does not trust a journaled block that never reached disk', async () => {
    await expect(copy()).rejects.toThrow()
    fs.truncateSync(destination, block - 1); fail = false
    await copy()
    expect(ranges).toEqual([undefined, undefined])
    expect(fs.readFileSync(destination).equals(payload)).toBe(true)
  })
  it('copies an empty original', async () => {
    fs.writeFileSync(source, ''); item.total = 0; fail = false
    expect(await copy()).toBe(createHash('sha256').digest('hex'))
    expect(fs.statSync(destination).size).toBe(0)
  })
})
