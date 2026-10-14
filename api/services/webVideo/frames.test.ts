// @vitest-environment node
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import {beforeEach, afterEach, describe, expect, it} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createMediaRepository} from '../../db/repositories/media'
import {createMarksRepository} from '../../db/repositories/marks'
import {saveWebVideoFrame} from './frames'

describe('web video frame storage', () => {
  let db: TestDb & {path: string}
  let mediaId: number
  let image: string
  beforeEach(async () => {
    db = {...createTestDb('web-frame'), path: await fs.mkdtemp(path.join(os.tmpdir(), 'mediachips-web-frame-'))}
    mediaId = createMediaRepository(db.drizzle).create({path: 'https://xhamster.com/videos/video-xhAb12', name: 'Web video'}).id
    const bytes = await sharp({create: {width: 800, height: 450, channels: 3, background: '#345678'}}).jpeg().toBuffer()
    image = `data:image/jpeg;base64,${bytes.toString('base64')}`
  })
  afterEach(async () => {
    closeTestDb(db)
    await fs.rm(db.path, {recursive: true, force: true})
  })

  it('stores resized JPEGs in the library poster and marker folders', async () => {
    const mark = createMarksRepository(db.drizzle).create({mediaId, time: 10})
    await saveWebVideoFrame(db, mediaId, {image, target: 'poster'})
    await saveWebVideoFrame(db, mediaId, {image, target: 'mark', markId: mark.id})
    const poster = path.join(db.path, 'media/videos/thumbs', `${mediaId}.jpg`)
    const marker = path.join(db.path, 'media/videos/marks', `${mark.id}.jpg`)
    expect(await sharp(poster).metadata()).toMatchObject({format: 'jpeg', width: 640, height: 360})
    expect(await sharp(marker).metadata()).toMatchObject({format: 'jpeg', width: 360})
    expect(await fs.readdir(path.dirname(marker))).toEqual([`${mark.id}.jpg`])
  })

  it('rejects local media, corrupt images and markers owned by another video', async () => {
    const local = createMediaRepository(db.drizzle).create({path: '/tmp/test.mp4'})
    const otherMark = createMarksRepository(db.drizzle).create({mediaId: local.id, time: 10})
    await expect(saveWebVideoFrame(db, local.id, {image, target: 'poster'})).rejects.toThrow('Web video not found')
    await expect(saveWebVideoFrame(db, mediaId, {image, target: 'mark', markId: otherMark.id})).rejects.toThrow('does not belong')
    await expect(saveWebVideoFrame(db, mediaId, {image: 'data:image/jpeg;base64,aGVsbG8=', target: 'poster'})).rejects.toThrow('Invalid JPEG')
    expect(await fs.readdir(db.path)).toEqual([])
  })

  it('does not write a frame after the active library switches during image processing', async () => {
    const oldPath = db.path
    const pending = saveWebVideoFrame(db, mediaId, {image, target: 'poster'})
    db.path = path.join(oldPath, 'different-library')
    await expect(pending).rejects.toThrow('active library changed')
    db.path = oldPath
    expect(await fs.readdir(oldPath)).toEqual([])
  })
})
