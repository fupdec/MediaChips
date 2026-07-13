import fs from 'fs'
import { resolveExistingPath } from './contentHash'

const CHUNK_SIZE = 64 * 1024
const UINT64_MASK = 0xFFFFFFFFFFFFFFFFn

function sumBytes(buffer: Buffer): bigint {
  if (buffer.length % 8 !== 0) {
    throw new Error('buffer is not a multiple of 8')
  }

  let sum = 0n
  for (let offset = 0; offset < buffer.length; offset += 8) {
    sum = (sum + buffer.readBigUInt64LE(offset)) & UINT64_MASK
  }

  return sum
}

function computeOshashFromChunks(fileSize: number, head: Buffer, tail: Buffer): string {
  const headSum = sumBytes(head)
  const tailSum = sumBytes(tail)
  const result = (headSum + tailSum + BigInt(fileSize)) & UINT64_MASK
  return result.toString(16).padStart(16, '0')
}

async function computeOshash(resolvedPath: string): Promise<string> {
  const stat = await fs.promises.stat(resolvedPath)
  const fileSize = stat.size

  if (fileSize <= 8) {
    throw new Error(`cannot calculate oshash where size <= 8 (${fileSize})`)
  }

  let chunkSize = CHUNK_SIZE
  if (fileSize < chunkSize) {
    chunkSize = Math.floor(fileSize / 8) * 8
  }

  const fd = await fs.promises.open(resolvedPath, 'r')

  try {
    const head = Buffer.alloc(chunkSize)
    await fd.read(head, 0, chunkSize, 0)

    const tail = Buffer.alloc(chunkSize)
    await fd.read(tail, 0, chunkSize, fileSize - chunkSize)

    return computeOshashFromChunks(fileSize, head, tail)
  } finally {
    await fd.close()
  }
}

async function computeOshashForPath(pathToFile: string): Promise<string> {
  const resolvedPath = await resolveExistingPath(pathToFile)

  if (!resolvedPath) {
    throw new Error(`File not found: ${pathToFile}`)
  }

  return computeOshash(resolvedPath)
}

export {
  CHUNK_SIZE,
  sumBytes,
  computeOshashFromChunks,
  computeOshash,
  computeOshashForPath,
}
