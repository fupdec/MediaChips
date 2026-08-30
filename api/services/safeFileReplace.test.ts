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
    expect(fs.readdirSync(tmpDir).filter((name) => name.endsWith('.tmp'))).toEqual([])
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
})
