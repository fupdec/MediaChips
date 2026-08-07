import type { ApiDb } from '../types/db'
import fs from 'fs'
import path from 'path'
import { readdir } from 'fs/promises'
import { resolveExistingPath } from './contentHash'
import { getMediaDeleteAssetFolder } from '../utils/mediaType'
import { createMarksRepository } from '../db/repositories/marks'
import { createFacesRepository } from '../db/repositories/faces'

const TIMELINE_PARTS = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95]
const TAG_IMAGE_SUFFIXES = ['main', 'avatar', 'alt', 'header', 'custom1', 'custom2']

function unlinkIfExists(filePath: string) {
  if (!filePath || !fs.existsSync(filePath)) return false

  fs.unlinkSync(filePath)
  return true
}

async function unlinkResolvedPath(filePath: string) {
  const resolvedPath = await resolveExistingPath(filePath)
  if (!resolvedPath) return false

  await fs.promises.unlink(resolvedPath)
  return true
}

function deleteVideoGeneratedAssets(dbPath: string, mediaId: unknown, markIds: unknown[] = []) {
  const mediaPath = path.join(dbPath, 'media/videos')

  unlinkIfExists(path.join(mediaPath, 'thumbs', `${mediaId}.jpg`))
  unlinkIfExists(path.join(mediaPath, 'grids', `${mediaId}.jpg`))

  for (const part of TIMELINE_PARTS) {
    unlinkIfExists(path.join(mediaPath, 'timelines', `${mediaId}_${part}.jpg`))
  }

  for (const markId of markIds) {
    deleteMarkGeneratedAsset(dbPath, markId)
  }

  const facesDir = path.join(mediaPath, 'faces', String(mediaId))
  if (fs.existsSync(facesDir)) {
    fs.rmSync(facesDir, {recursive: true, force: true})
  }
}

function deleteImageGeneratedAssets(dbPath: string, mediaId: unknown) {
  unlinkIfExists(path.join(dbPath, 'media/images/thumbs', `${mediaId}.jpg`))
}

function deleteAudioGeneratedAssets(dbPath: string, mediaId: unknown) {
  unlinkIfExists(path.join(dbPath, 'media/audios/thumbs', `${mediaId}.jpg`))
}

function deleteMarkGeneratedAsset(dbPath: string, markId: unknown) {
  unlinkIfExists(path.join(dbPath, 'media/videos/marks', `${markId}.jpg`))
}

async function deleteTagGeneratedAssets(dbPath: string, metaId: unknown, tagId: unknown) {
  if (!metaId || !tagId) return

  const metaPath = path.join(dbPath, 'meta', String(metaId))
  const prefix = `${tagId}_`
  const deleted = new Set<string>()

  if (fs.existsSync(metaPath)) {
    const files = await readdir(metaPath)

    for (const file of files) {
      if (!file.startsWith(prefix)) continue
      if (!/\.(jpg|jpeg|png|webp)$/i.test(file)) continue

      const filePath = path.join(metaPath, file)
      if (unlinkIfExists(filePath)) {
        deleted.add(file)
      }
    }
  }

  for (const suffix of TAG_IMAGE_SUFFIXES) {
    const fileName = `${tagId}_${suffix}.jpg`
    if (deleted.has(fileName)) continue
    unlinkIfExists(path.join(metaPath, fileName))
  }
}

async function deleteMediaGeneratedAssets(
  db: ApiDb,
  dbPath: string,
  media: { id: unknown },
  mediaType: string,
) {
  const marksRepo = createMarksRepository(db.drizzle)
  const assetFolder = getMediaDeleteAssetFolder(mediaType)

  if (assetFolder === 'videos') {
    const marks = marksRepo.findIdsByMediaId(media.id)

    deleteVideoGeneratedAssets(
      dbPath,
      media.id,
      marks.map((mark: {id: number}) => mark.id),
    )
    createFacesRepository(db.drizzle).deleteByMediaId(Number(media.id))
    return
  }

  if (assetFolder === 'images') {
    deleteImageGeneratedAssets(dbPath, media.id)
    return
  }

  if (assetFolder === 'audios') {
    deleteAudioGeneratedAssets(dbPath, media.id)
  }
}

export {
  deleteVideoGeneratedAssets,
  deleteImageGeneratedAssets,
  deleteAudioGeneratedAssets,
  deleteMarkGeneratedAsset,
  deleteTagGeneratedAssets,
  deleteMediaGeneratedAssets,
  unlinkIfExists,
  unlinkResolvedPath,
}
