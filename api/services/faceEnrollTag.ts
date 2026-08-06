/** Performer-tag enrollment: crop largest face and enroll gallery images. */

import type {ApiDb} from '../types/db'
import type {FaceBox} from '../types/faceDetector'
import fs from 'fs'
import {Jimp} from 'jimp'
import {createFaceEnrollmentsRepository} from '../db/repositories/faceEnrollments'
import {
  MAX_ENROLLMENTS_PER_TAG,
  assessEnrollmentDetections,
  isNearDuplicateEmbedding,
} from './enrollmentGates'
import {
  collectEnrollmentSourcePaths,
  collectExistingEmbeddings,
  toEnrollmentSourcePath as toEnrollmentSourcePathFromDb,
} from './faceEnrollmentPaths'
import {resolveEnrollSourcePathDecision} from './faceEnrollIterate'
import {embeddingFromJson} from './faceMatchScoring'
import {
  detectFacesInFrame,
  loadModel as loadDetectionModel,
  saveFaceCrop,
} from './faceDetector'

/** ArcFace input size — keep letterbox fallback aligned with embed preprocess. */
const EMBED_CROP_SIZE = 112

function toEnrollmentSourcePath(db: ApiDb, imagePath: string) {
  return toEnrollmentSourcePathFromDb(String(db.path || ''), imagePath)
}

function getEmbedApi() {
  const runtime = require('./faceEmbedRuntime') as typeof import('./faceEmbedRuntime')
  const scoring = require('./faceMatchScoring') as typeof import('./faceMatchScoring')
  return {
    embedImage: runtime.embedImage,
    embeddingToJson: scoring.embeddingToJson,
  }
}

export function pickLargestDetection<T extends {box: FaceBox}>(detections: T[]): T {
  return detections.reduce((a, b) => (
    (a.box.width * a.box.height) >= (b.box.width * b.box.height) ? a : b
  ))
}

export async function extractLargestFaceCrop(
  db: ApiDb,
  imagePath: string,
  outputPath: string,
  options: {fallbackWholeImage?: boolean; minScore?: number} = {},
): Promise<boolean> {
  const detector = await loadDetectionModel(db)
  const detections = await detectFacesInFrame(detector, imagePath, {
    minScore: options.minScore ?? 0.45,
    maxFacesPerFrame: 5,
  })
  if (!detections.length) {
    if (options.fallbackWholeImage === false) return false
    // Last resort only: letterbox the whole image (still weak — prefer real face crops).
    const image = await Jimp.read(imagePath)
    const buffer = await image.clone().contain({w: EMBED_CROP_SIZE, h: EMBED_CROP_SIZE}).getBuffer('image/jpeg', {quality: 90})
    await fs.promises.writeFile(outputPath, buffer)
    return true
  }

  const best = pickLargestDetection(detections)
  const sourceImage = await Jimp.read(imagePath)
  await saveFaceCrop(sourceImage, best.box as FaceBox, outputPath)
  return true
}

export async function enrollTagImage(
  db: ApiDb,
  tagId: number,
  metaId: number,
  imagePath: string,
  source: 'tagImage' | 'faceCrop' | 'upload' = 'tagImage',
  options: {
    existingEmbeddings?: Float32Array[]
  } = {},
) {
  const detector = await loadDetectionModel(db)
  const detections = await detectFacesInFrame(detector, imagePath, {
    minScore: 0.5,
    maxFacesPerFrame: 5,
  })
  const image = await Jimp.read(imagePath)
  const assessment = assessEnrollmentDetections(detections, image.width, image.height)
  // Skip weak / group / tiny / no-face refs — they pollute ranking more than they help.
  if (!assessment.ok) return false

  const {embedImage, embeddingToJson} = getEmbedApi()
  const box = assessment.best.box as FaceBox
  const embedding = await embedImage(db, imagePath, box, assessment.best.kps || null)
  if (options.existingEmbeddings && isNearDuplicateEmbedding(embedding, options.existingEmbeddings)) {
    return false
  }
  createFaceEnrollmentsRepository(db.drizzle).create({
    tagId,
    metaId,
    source,
    sourcePath: toEnrollmentSourcePath(db, imagePath),
    embedding: embeddingToJson(embedding),
  })
  options.existingEmbeddings?.push(embedding)
  return true
}

export async function enrollTagFromAllImages(
  db: ApiDb,
  tagId: number,
  metaId: number,
  imagePaths: string[],
  options: {force?: boolean} = {},
) {
  const enrollmentsRepo = createFaceEnrollmentsRepository(db.drizzle)
  const existing = enrollmentsRepo.findByTagId(tagId)
  if (options.force && existing.length) {
    enrollmentsRepo.deleteByTagId(tagId)
  }

  const enrolledRows = options.force ? [] : existing
  const enrolledSources = collectEnrollmentSourcePaths(enrolledRows)

  const existingEmbeddings = collectExistingEmbeddings(enrolledRows, embeddingFromJson)

  let created = 0
  for (const imagePath of imagePaths) {
    const sourcePath = toEnrollmentSourcePath(db, imagePath)
    const decision = resolveEnrollSourcePathDecision({
      enrolledCount: enrolledRows.length + created,
      maxEnrollments: MAX_ENROLLMENTS_PER_TAG,
      sourcePath,
      imagePath,
      enrolledSources,
    })
    if (decision.kind === 'stop') break
    if (decision.kind === 'skip-existing') continue
    const ok = await enrollTagImage(db, tagId, metaId, imagePath, 'tagImage', {
      existingEmbeddings,
    })
    if (ok) {
      created += 1
      enrolledSources.add(decision.sourcePath)
    }
  }

  return created
}
