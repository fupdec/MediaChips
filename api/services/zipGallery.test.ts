/**
 * @vitest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import archiver from 'archiver'
import {
  buildVirtualZipPath,
  buildZipSkipMessage,
  isEncryptedZipEntry,
  isSafeZipEntryName,
  isVirtualZipPath,
  listZipImageEntries,
  normalizeZipEntryName,
  parseVirtualZipPath,
  readZipEntryBuffer,
  zipEntryExists,
  collectFilesWithZipGalleries,
} from './zipGallery'

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

describe('zipGallery path helpers', () => {
  it('builds skip messages and detects encrypted entries', () => {
    expect(buildZipSkipMessage('/a.zip', 'too_large')).toContain('too large')
    expect(buildZipSkipMessage('/a.zip', 'encrypted')).toContain('encrypted')
    expect(isEncryptedZipEntry({encrypted: true})).toBe(true)
    expect(isEncryptedZipEntry({encryped: true})).toBe(true)
    expect(isEncryptedZipEntry({})).toBe(false)
  })

  it('builds and parses virtual zip paths', () => {
    const zipPath = path.join('/media', 'album.zip')
    const virtual = buildVirtualZipPath(zipPath, 'nested/photo.jpg')
    expect(isVirtualZipPath(virtual)).toBe(true)
    expect(virtual).toContain('!/')
    expect(parseVirtualZipPath(virtual)).toEqual({
      zipPath: expect.stringContaining('album.zip'),
      entryName: 'nested/photo.jpg',
    })
  })

  it('rejects unsafe entry names', () => {
    expect(isSafeZipEntryName('../secret.jpg')).toBe(false)
    expect(isSafeZipEntryName('/abs/photo.jpg')).toBe(false)
    expect(isSafeZipEntryName('ok/photo.jpg')).toBe(true)
    expect(normalizeZipEntryName('\\folder\\a.JPG')).toBe('folder/a.JPG')
  })
})

describe('zipGallery list/read', () => {
  let tempDir = ''

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-zip-gallery-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('lists image entries and reads bytes without full extract', async () => {
    const zipPath = path.join(tempDir, 'gallery.zip')
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x00, 0x01])
    await writeZip(zipPath, {
      'a.jpg': jpegBytes,
      'skip.txt': 'nope',
      'nested/b.PNG': jpegBytes,
    })

    const listed = await listZipImageEntries(zipPath, ['jpg', 'png'])
    expect(listed.ok).toBe(true)
    if (!listed.ok) return

    expect(listed.entries.map((e) => e.entryName).sort()).toEqual(['a.jpg', 'nested/b.PNG'])

    const bufferResult = await readZipEntryBuffer(listed.entries[0]!.virtualPath)
    expect(bufferResult?.buffer.equals(jpegBytes)).toBe(true)
    expect(await zipEntryExists(listed.entries[0]!.virtualPath)).toBe(true)
  })

  it('skips archives that exceed size limit', async () => {
    const zipPath = path.join(tempDir, 'huge.zip')
    await writeZip(zipPath, { 'a.jpg': Buffer.alloc(200, 1) })

    const listed = await listZipImageEntries(zipPath, ['jpg'], { maxZipBytes: 50 })
    expect(listed.ok).toBe(false)
    if (listed.ok) return
    expect(listed.skipped.reason).toBe('too_large')
  })

  it('skips archives with too many image entries', async () => {
    const zipPath = path.join(tempDir, 'many.zip')
    await writeZip(zipPath, {
      'a.jpg': '1',
      'b.jpg': '2',
      'c.jpg': '3',
    })

    const listed = await listZipImageEntries(zipPath, ['jpg'], { maxImageEntries: 2 })
    expect(listed.ok).toBe(false)
    if (listed.ok) return
    expect(listed.skipped.reason).toBe('too_many_entries')
  })

  it('skips oversized individual entries', async () => {
    const zipPath = path.join(tempDir, 'entry.zip')
    await writeZip(zipPath, {
      'huge.jpg': Buffer.alloc(120, 1),
      'small.jpg': Buffer.from('ok'),
    })

    const listed = await listZipImageEntries(zipPath, ['jpg'], {
      maxEntryUncompressedBytes: 50,
    })
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.entries.map((e) => e.entryName)).toEqual(['small.jpg'])
  })

  it('collects loose images and expands zip galleries under a folder', async () => {
    const loose = path.join(tempDir, 'loose.jpg')
    await fs.promises.writeFile(loose, 'x')
    const zipPath = path.join(tempDir, 'nested', 'album.zip')
    await writeZip(zipPath, { 'inside.png': 'y' })

    const result = await collectFilesWithZipGalleries({
      entryPath: tempDir,
      regex: /\.(jpg|png)$/i,
      excluded: [],
      extensions: ['jpg', 'png'],
      expandZips: true,
    })

    expect(result.files.some((f) => f.endsWith('loose.jpg'))).toBe(true)
    expect(result.files.some((f) => f.includes('album.zip!/') && f.endsWith('inside.png'))).toBe(true)
    expect(result.skippedZips).toEqual([])
  })
})
