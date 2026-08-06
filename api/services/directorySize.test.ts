/**
 * @vitest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it} from 'vitest'
import {getDirectorySize} from './directorySize'

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
    expect(await getDirectorySize(path.join(os.tmpdir(), 'mc-missing-dirsize'))).toBe(0)
  })

  it('sums nested files', async () => {
    const root = makeTempRoot()
    roots.push(root)
    fs.mkdirSync(path.join(root, 'a', 'b'), {recursive: true})
    fs.writeFileSync(path.join(root, 'root.bin'), 'aaaa')
    fs.writeFileSync(path.join(root, 'a', 'mid.bin'), 'bbbbbb')
    fs.writeFileSync(path.join(root, 'a', 'b', 'leaf.bin'), 'cc')

    expect(await getDirectorySize(root)).toBe(4 + 6 + 2)
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
})
