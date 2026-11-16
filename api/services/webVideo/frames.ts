import fs from 'fs/promises'
import path from 'path'
import {randomUUID} from 'crypto'
import type {z} from 'zod'
import type {ApiDb} from '../../types/db'
import {createMediaRepository} from '../../db/repositories/media'
import {createMarksRepository} from '../../db/repositories/marks'
import {isWebVideoPath, WebVideoFrameSchema} from '../../../shared/webVideo'

/** The API determines the destination and validates marker ownership. */
export async function saveWebVideoFrame(db: ApiDb, mediaId: number, input: z.infer<typeof WebVideoFrameSchema>, isAllowedPath: (value: unknown) => boolean = isWebVideoPath) {
  const data = WebVideoFrameSchema.parse(input)
  const databasePath = db.path
  const sqlite = db.sqlite
  const drizzle = db.drizzle
  const media = createMediaRepository(db.drizzle).findById(mediaId)
  if (!db.path || !media || media.deletedAt || !isAllowedPath(media.path)) throw new Error('Web video not found.')
  if (data.target === 'mark') {
    const mark = createMarksRepository(db.drizzle).findById(data.markId!)
    if (!mark || mark.deletedAt || mark.mediaId !== mediaId) throw new Error('Marker does not belong to this video.')
  }
  const assertCurrentDatabase = () => {
    if (db.path !== databasePath || db.sqlite !== sqlite || db.drizzle !== drizzle) throw new Error('The active library changed.')
    const currentMedia = createMediaRepository(drizzle).findById(mediaId)
    if (!currentMedia || currentMedia.deletedAt || currentMedia.path !== media.path) throw new Error('Web video not found.')
    if (data.target === 'mark' && !createMarksRepository(drizzle).findByIdAndMediaId(data.markId!, mediaId)) {
      throw new Error('Marker does not belong to this video.')
    }
  }
  const destination = path.join(db.path, 'media', 'videos', data.target === 'poster' ? 'thumbs' : 'marks',
    `${data.target === 'poster' ? mediaId : data.markId}.jpg`)
  const bytes = Buffer.from(data.image.slice('data:image/jpeg;base64,'.length), 'base64')
  if (bytes.length > 2 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Invalid JPEG frame.')
  const {default: sharp} = await import('sharp')
  const jpeg = await sharp(bytes, {limitInputPixels: 16_777_216})
    .resize({width: data.target === 'poster' ? 640 : 360, withoutEnlargement: true})
    .jpeg({quality: 85}).toBuffer()
  const temporary = `${destination}.${randomUUID()}.tmp`
  assertCurrentDatabase()
  await fs.mkdir(path.dirname(destination), {recursive: true})
  try {
    await fs.writeFile(temporary, jpeg, {flag: 'wx'})
    assertCurrentDatabase()
    await fs.rename(temporary, destination)
  } finally { await fs.rm(temporary, {force: true}) }
}
