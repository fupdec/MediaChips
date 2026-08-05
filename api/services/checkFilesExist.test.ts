/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import archiver from 'archiver'
import { checkFilesExist } from './checkFilesExist'
import { buildVirtualZipPath } from './zipGallery'

async function writeZip(zipPath: string, files: Record<string, Buffer | string>) {
  await fs.promises.mkdir(path.dirname(zipPath), { recursive: true })
  const output = fs.createWriteStream(zipPath)
  const archive = archiver('zip', { zlib: { level: 1 } })
  const done = new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve())
    output.on('error', reject)
    archive.on('error', reject)
  })
  archive.pipe(output)
  for (const [name, content] of Object.entries(files)) {
    archive.append(typeof content === 'string' ? Buffer.from(content) : content, { name })
  }
  await archive.finalize()
  await done
}

describe('checkFilesExist', () => {
  it('returns existence map for unique paths', async () => {
    const results = await checkFilesExist([
      __filename,
      __filename,
      '/definitely-missing-file-12345.tmp',
    ])

    expect(results[__filename]).toBe(true)
    expect(results['/definitely-missing-file-12345.tmp']).toBe(false)
    expect(Object.keys(results)).toHaveLength(2)
  })

  it('detects virtual zip entry existence', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-check-zip-'))
    try {
      const zipPath = path.join(tempDir, 'g.zip')
      await writeZip(zipPath, { 'a.jpg': 'x' })
      const virtual = buildVirtualZipPath(zipPath, 'a.jpg')
      const missing = buildVirtualZipPath(zipPath, 'missing.jpg')

      const results = await checkFilesExist([virtual, missing])
      expect(results[virtual]).toBe(true)
      expect(results[missing]).toBe(false)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
