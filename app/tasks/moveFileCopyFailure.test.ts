import fssync, {promises as fs} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {Readable} from 'node:stream'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('../server/resolvePathCache', () => ({clearResolvedPathCache: vi.fn()}))

import {moveFile} from './moveFile'

/** Moving across devices copies the file; a copy that dies midway must not leave a partial file behind. */
describe('moveFile cross-device copy failure', () => {
  let dir: string
  let source: string
  let destination: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'move-file-'))
    source = path.join(dir, 'source.bin')
    destination = path.join(dir, 'target', 'source.bin')
    await fs.writeFile(source, Buffer.alloc(64 * 1024, 7))
    vi.spyOn(fs, 'rename').mockRejectedValue(Object.assign(new Error('cross-device'), {code: 'EXDEV'}))
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(dir, {recursive: true, force: true})
  })

  function failMidway() {
    const original = fssync.createReadStream
    vi.spyOn(fssync, 'createReadStream').mockImplementation(((file: fssync.PathLike, options?: unknown) => {
      if (String(file) !== source) return original(file, options as never)
      let sent = false
      return new Readable({
        read() {
          if (!sent) { sent = true; this.push(Buffer.alloc(1024, 7)) } else this.destroy(new Error('disk read error'))
        },
      }) as never
    }) as never)
  }

  it('removes the partial destination and keeps the source when the copy fails', async () => {
    failMidway()
    await expect(moveFile(source, destination)).rejects.toThrow('disk read error')
    await expect(fs.stat(destination)).rejects.toMatchObject({code: 'ENOENT'})
    expect((await fs.stat(source)).size).toBe(64 * 1024)
  })

  it('lets the move be retried after a failed copy', async () => {
    failMidway()
    await expect(moveFile(source, destination)).rejects.toThrow()
    vi.restoreAllMocks()
    vi.spyOn(fs, 'rename').mockRejectedValue(Object.assign(new Error('cross-device'), {code: 'EXDEV'}))
    const result = await moveFile(source, destination)
    expect(result).toMatchObject({crossDevice: true, size: 64 * 1024})
    expect((await fs.stat(destination)).size).toBe(64 * 1024)
  })
})
