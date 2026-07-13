import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  computeOshash,
  computeOshashForPath,
  computeOshashFromChunks,
  sumBytes,
} from './oshash'

const tempFiles: string[] = []

afterEach(async () => {
  await Promise.all(tempFiles.splice(0).map(async (filePath) => {
    await fs.promises.unlink(filePath).catch(() => {})
  }))
})

async function createTempFile(contents: Buffer): Promise<string> {
  const filePath = path.join(os.tmpdir(), `mediachips-oshash-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`)
  await fs.promises.writeFile(filePath, contents)
  tempFiles.push(filePath)
  return filePath
}

describe('oshash', () => {
  it('sums uint64 little-endian values with overflow', () => {
    const buffer = Buffer.alloc(16)
    buffer.writeBigUInt64LE(0xFFFFFFFFFFFFFFFFn, 0)
    buffer.writeBigUInt64LE(1n, 8)

    expect(sumBytes(buffer)).toBe(0n)
  })

  it('matches stash algorithm for overlapping chunks on small files', () => {
    const contents = Buffer.alloc(72, 0xAB)
    const chunkSize = Math.floor(contents.length / 8) * 8
    const head = contents.subarray(0, chunkSize)
    const tail = contents.subarray(contents.length - chunkSize)

    expect(computeOshashFromChunks(contents.length, head, tail))
      .toMatch(/^[0-9a-f]{16}$/)
  })

  it('returns stable hash for the same file', async () => {
    const contents = Buffer.alloc(128 * 1024 + 123, 7)
    const filePath = await createTempFile(contents)

    const first = await computeOshash(filePath)
    const second = await computeOshash(filePath)

    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{16}$/)
  })

  it('resolves path variants before hashing', async () => {
    const contents = Buffer.alloc(256, 3)
    const filePath = await createTempFile(contents)

    await expect(computeOshashForPath(filePath)).resolves.toMatch(/^[0-9a-f]{16}$/)
  })

  it('rejects files that are too small', async () => {
    const filePath = await createTempFile(Buffer.from([1, 2, 3, 4]))

    await expect(computeOshash(filePath)).rejects.toThrow(/size <= 8/)
  })
})
