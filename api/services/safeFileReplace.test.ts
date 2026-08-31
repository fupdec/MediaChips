/**
 * @vitest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it} from 'vitest'
import {replaceFileWithRetry, writeFileAtomically} from './safeFileReplace'

describe('safeFileReplace', () => {
  let tmpDir = ''

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, {recursive: true, force: true})
    }
    tmpDir = ''
  })

  it('writes a new file atomically', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-safe-replace-'))
    const target = path.join(tmpDir, 'out.jpg')

    await writeFileAtomically(target, async (tempPath) => {
      await fs.promises.writeFile(tempPath, Buffer.from('poster-bytes'))
    })

    expect(fs.readFileSync(target, 'utf8')).toBe('poster-bytes')
    expect(fs.readdirSync(tmpDir).filter((name) => name.includes('.tmp'))).toEqual([])
  })

  it('replaces an existing file', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-safe-replace-'))
    const target = path.join(tmpDir, 'out.jpg')
    fs.writeFileSync(target, 'old')

    await replaceFileWithRetry(
      (() => {
        const temp = `${target}.tmp`
        fs.writeFileSync(temp, 'new')
        return temp
      })(),
      target,
    )

    expect(fs.readFileSync(target, 'utf8')).toBe('new')
  })

  it('overwrites a locked destination via copy fallback when rename fails', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-safe-replace-'))
    const target = path.join(tmpDir, 'out.jpg')
    const temp = path.join(tmpDir, 'out.jpg.tmp')
    fs.writeFileSync(target, 'old')
    fs.writeFileSync(temp, 'new')

    // Simulate a destination that survives unlink but accepts copyFile.
    const originalUnlink = fs.promises.unlink
    const originalRename = fs.promises.rename
    let unlinkCalls = 0
    let renameCalls = 0
    fs.promises.unlink = (async (filePath: fs.PathLike) => {
      unlinkCalls += 1
      if (String(filePath) === target) {
        const err = new Error('EPERM') as NodeJS.ErrnoException
        err.code = 'EPERM'
        throw err
      }
      return originalUnlink(filePath)
    }) as typeof fs.promises.unlink
    fs.promises.rename = (async () => {
      renameCalls += 1
      const err = new Error('EPERM') as NodeJS.ErrnoException
      err.code = 'EPERM'
      throw err
    }) as typeof fs.promises.rename

    try {
      await replaceFileWithRetry(temp, target)
      expect(fs.readFileSync(target, 'utf8')).toBe('new')
      expect(unlinkCalls).toBeGreaterThan(0)
      expect(renameCalls).toBeGreaterThan(0)
      expect(fs.existsSync(temp)).toBe(false)
    } finally {
      fs.promises.unlink = originalUnlink
      fs.promises.rename = originalRename
    }
  })
})
