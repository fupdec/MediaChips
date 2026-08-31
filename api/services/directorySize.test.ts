/**
 * @vitest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {getDirectorySize, tryNativeDirectorySize} from './directorySize'

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mc-dirsize-'))
}

describe('getDirectorySize', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, {recursive: true, force: true})
    }
  })

  it('returns 0 for missing directories', async () => {
    expect(await getDirectorySize(path.join(os.tmpdir(), 'mc-missing-dirsize'), {
      preferWalk: true,
    })).toBe(0)
  })

  it('sums nested files via walk', async () => {
    const root = makeTempRoot()
    roots.push(root)
    fs.mkdirSync(path.join(root, 'a', 'b'), {recursive: true})
    fs.writeFileSync(path.join(root, 'root.bin'), 'aaaa')
    fs.writeFileSync(path.join(root, 'a', 'mid.bin'), 'bbbbbb')
    fs.writeFileSync(path.join(root, 'a', 'b', 'leaf.bin'), 'cc')

    expect(await getDirectorySize(root, {preferWalk: true})).toBe(4 + 6 + 2)
  })

  it('caps concurrent stat calls', async () => {
    const root = makeTempRoot()
    roots.push(root)
    for (let i = 0; i < 8; i += 1) {
      fs.writeFileSync(path.join(root, `f${i}.bin`), String(i))
    }

    let inFlight = 0
    let maxInFlight = 0
    await getDirectorySize(root, {
      preferWalk: true,
      concurrency: 2,
      stat: async (filePath) => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 15))
        try {
          return await fs.promises.stat(filePath)
        } finally {
          inFlight -= 1
        }
      },
    })

    expect(maxInFlight).toBeLessThanOrEqual(2)
    expect(maxInFlight).toBeGreaterThan(1)
  })

  it('prefers native du when it returns a size', async () => {
    const root = makeTempRoot()
    roots.push(root)
    fs.writeFileSync(path.join(root, 'a.bin'), 'hello')

    const tryNativeDu = vi.fn(async () => 4096)
    expect(await getDirectorySize(root, {tryNativeDu})).toBe(4096)
    expect(tryNativeDu).toHaveBeenCalledWith(root)
  })

  it('falls back to walk when native du is unavailable', async () => {
    const root = makeTempRoot()
    roots.push(root)
    fs.writeFileSync(path.join(root, 'a.bin'), 'abcd')

    expect(await getDirectorySize(root, {
      tryNativeDu: async () => null,
    })).toBe(4)
  })
})

describe('tryNativeDirectorySize', () => {
  it('returns a positive size for a real directory on Unix', async () => {
    if (process.platform === 'win32') return

    const root = makeTempRoot()
    try {
      fs.writeFileSync(path.join(root, 'blob.bin'), Buffer.alloc(2048, 1))
      const size = await tryNativeDirectorySize(root)
      expect(size).toBeGreaterThanOrEqual(2048)
    } finally {
      fs.rmSync(root, {recursive: true, force: true})
    }
  })
})
