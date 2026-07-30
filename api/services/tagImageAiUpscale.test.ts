import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {Jimp} from 'jimp'

vi.mock('../db/repositories/tags', () => ({
  createTagsRepository: () => ({
    findAllIds: () => [{id: 10}],
  }),
}))

vi.mock('../db/repositories/meta', () => ({
  createMetaRepository: () => ({
    findAllIds: () => [{id: 1}],
    findArrayIds: () => [{id: 1}, {id: 2}],
  }),
}))

import {
  clearTagImageAiUpscaleStatusCache,
  cleanupMetaTagAssets,
  findFirstPendingTagImage,
  getRealesrganZipUrl,
  hasAnyUpscaleCandidateFiles,
  isTransientDownloadError,
  needsTagAiUpscale,
  REALESRGAN_SCALE,
  TAG_AI_UPSCALE_DOWNLOAD_SIZE_MB,
  TAG_IMAGES_AI_UPSCALED_SETTING,
} from './tagImageAiUpscale'

describe('tagImageAiUpscale helpers', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, {recursive: true, force: true})
    }
    clearTagImageAiUpscaleStatusCache()
  })

  async function makeDbWithTagImage(opts: {width: number; height: number; type?: string}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-upscale-'))
    tempDirs.push(root)
    const metaDir = path.join(root, 'meta', '1')
    fs.mkdirSync(metaDir, {recursive: true})
    const type = opts.type || 'main'
    const filePath = path.join(metaDir, `42_${type}.jpg`)
    const image = new Jimp({width: opts.width, height: opts.height, color: 0xff0000ff})
    await image.write(filePath as `${string}.${string}`)
    return root
  }

  it('detects undersized images against target width', () => {
    expect(needsTagAiUpscale(300, 300, 600)).toBe(true)
    expect(needsTagAiUpscale(600, 400, 600)).toBe(false)
    expect(needsTagAiUpscale(164, 164, 320)).toBe(true)
    expect(needsTagAiUpscale(0, 100, 600)).toBe(false)
  })

  it('maps platform zip URLs', () => {
    expect(getRealesrganZipUrl('darwin')).toContain('macos.zip')
    expect(getRealesrganZipUrl('win32')).toContain('windows.zip')
    expect(getRealesrganZipUrl('linux')).toContain('ubuntu.zip')
    expect(TAG_AI_UPSCALE_DOWNLOAD_SIZE_MB).toBeGreaterThan(0)
    expect(TAG_IMAGES_AI_UPSCALED_SETTING).toBe('migrations.tagImagesAiUpscaledV5')
    expect(REALESRGAN_SCALE).toBe(4)
  })

  it('treats TLS disconnects as transient download errors', () => {
    expect(isTransientDownloadError(new Error(
      'Client network socket disconnected before secure TLS connection was established',
    ))).toBe(true)
    expect(isTransientDownloadError(Object.assign(new Error('fail'), {code: 'ECONNRESET'}))).toBe(true)
    expect(isTransientDownloadError(new Error('HTTP 404'))).toBe(false)
  })

  it('syncs meta folders and deletes orphan tag images', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-orphan-'))
    tempDirs.push(root)
    const keepDir = path.join(root, 'meta', '1')
    const orphanDir = path.join(root, 'meta', '99')
    fs.mkdirSync(keepDir, {recursive: true})
    fs.mkdirSync(orphanDir, {recursive: true})
    const keep = path.join(keepDir, '10_main.jpg')
    const orphan = path.join(keepDir, '99_avatar.jpg')
    const headerOrphan = path.join(keepDir, '99_header.jpg')
    const noise = path.join(keepDir, 'readme.txt')
    fs.writeFileSync(keep, 'keep')
    fs.writeFileSync(orphan, 'orphan')
    fs.writeFileSync(headerOrphan, 'orphan-header')
    fs.writeFileSync(noise, 'noise')
    fs.writeFileSync(path.join(orphanDir, '1_main.jpg'), 'gone')

    const result = await cleanupMetaTagAssets({
      path: root,
      drizzle: {},
      sqlite: {},
    } as any)

    expect(result.foldersRemoved).toBe(1)
    expect(result.foldersCreated).toBe(1)
    expect(result.orphansDeleted).toBe(2)
    expect(result.imagesResized).toBe(0)
    expect(fs.existsSync(orphanDir)).toBe(false)
    expect(fs.existsSync(path.join(root, 'meta', '2'))).toBe(true)
    expect(fs.existsSync(keep)).toBe(true)
    expect(fs.existsSync(orphan)).toBe(false)
    expect(fs.existsSync(headerOrphan)).toBe(false)
    expect(fs.existsSync(noise)).toBe(true)
  })

  it('downscales oversized poster and avatar images during cleanup', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-downscale-'))
    tempDirs.push(root)
    const metaDir = path.join(root, 'meta', '1')
    fs.mkdirSync(metaDir, {recursive: true})

    const posterPath = path.join(metaDir, '10_main.jpg')
    const avatarPath = path.join(metaDir, '10_avatar.jpg')
    const okPath = path.join(metaDir, '10_alt.jpg')
    await new Jimp({width: 1200, height: 800, color: 0xff0000ff}).write(posterPath as `${string}.${string}`)
    await new Jimp({width: 640, height: 480, color: 0x00ff00ff}).write(avatarPath as `${string}.${string}`)
    await new Jimp({width: 600, height: 400, color: 0x0000ffff}).write(okPath as `${string}.${string}`)

    const result = await cleanupMetaTagAssets({
      path: root,
      drizzle: {},
      sqlite: {},
    } as any)

    expect(result.imagesResized).toBe(2)

    const {default: sharp} = await import('sharp')
    const poster = await sharp(posterPath).metadata()
    const avatar = await sharp(avatarPath).metadata()
    const ok = await sharp(okPath).metadata()
    expect(poster.width).toBe(600)
    expect(poster.height).toBe(400)
    expect(avatar.width).toBe(320)
    expect(avatar.height).toBe(320)
    expect(ok.width).toBe(600)
    expect(ok.height).toBe(400)
  })

  it('finds candidate files without reading every directory to completion once one exists', async () => {
    const root = await makeDbWithTagImage({width: 600, height: 400})
    expect(await hasAnyUpscaleCandidateFiles(root)).toBe(true)
    expect(await hasAnyUpscaleCandidateFiles(path.join(root, 'missing'))).toBe(false)
  })

  it('stops pending detection after the first undersized image', async () => {
    const root = await makeDbWithTagImage({width: 300, height: 300})
    const first = await findFirstPendingTagImage(root)
    expect(first).not.toBeNull()
    expect(first?.type).toBe('main')
    expect(first?.targetWidth).toBe(600)
  })

  it('returns null when tag images already meet target size', async () => {
    const root = await makeDbWithTagImage({width: 600, height: 400})
    expect(await findFirstPendingTagImage(root)).toBeNull()
  })
})
