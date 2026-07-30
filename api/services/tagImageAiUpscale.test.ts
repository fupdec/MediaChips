import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it} from 'vitest'
import {Jimp} from 'jimp'
import {
  clearTagImageAiUpscaleStatusCache,
  findFirstPendingTagImage,
  getRealesrganZipUrl,
  hasAnyUpscaleCandidateFiles,
  needsTagAiUpscale,
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
    expect(needsTagAiUpscale(164, 164, 328)).toBe(true)
    expect(needsTagAiUpscale(0, 100, 600)).toBe(false)
  })

  it('maps platform zip URLs', () => {
    expect(getRealesrganZipUrl('darwin')).toContain('macos.zip')
    expect(getRealesrganZipUrl('win32')).toContain('windows.zip')
    expect(getRealesrganZipUrl('linux')).toContain('ubuntu.zip')
    expect(TAG_AI_UPSCALE_DOWNLOAD_SIZE_MB).toBeGreaterThan(0)
    expect(TAG_IMAGES_AI_UPSCALED_SETTING).toBe('migrations.tagImagesAiUpscaled')
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
