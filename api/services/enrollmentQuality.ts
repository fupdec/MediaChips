import fs from 'fs'
import path from 'path'
import { Jimp } from 'jimp'
import type { ApiDb } from '../types/db'
import { detectFacesInFrame, loadModel } from './faceDetector'
import { createFaceEnrollmentsRepository } from '../db/repositories/faceEnrollments'
import { createTagsRepository } from '../db/repositories/tags'
import { getFaceMatchSettings } from './faceRecognition'

export type EnrollmentIssue =
  | 'missing_file'
  | 'no_face'
  | 'multi_face'
  | 'low_score'
  | 'face_too_small'
  | 'not_enrolled'
  | 'inconsistent'
  | 'confused'

export type EnrollmentGrade = 'good' | 'ok' | 'weak' | 'bad' | 'none'

export interface EnrollmentImageQuality {
  type: string
  sourcePath: string
  absolutePath: string
  exists: boolean
  enrolled: boolean
  faceCount: number
  detectScore: number | null
  faceAreaRatio: number | null
  issues: EnrollmentIssue[]
  grade: EnrollmentGrade
}

export interface EnrollmentTagQuality {
  tagId: number
  tagName: string | null
  imageCount: number
  enrolledCount: number
  intraSimilarity: number | null
  confusionScore: number | null
  confusedWithTagId: number | null
  confusedWithTagName: string | null
  images: EnrollmentImageQuality[]
  issues: EnrollmentIssue[]
  grade: EnrollmentGrade
}

const PREFERRED_IMAGE_TYPES = ['main', 'avatar', 'alt', 'custom1', 'custom2', 'header']
const LOW_DETECT_SCORE = 0.55
const GOOD_DETECT_SCORE = 0.7
const MIN_FACE_AREA_RATIO = 0.04
const INTRA_WEAK = 0.4
const CONFUSION_WARN = 0.55

function embeddingFromJson(value: string): Float32Array {
  const parsed = JSON.parse(value) as number[]
  return Float32Array.from(parsed)
}

function cosineSimilarity(a: Float32Array, b: Float32Array) {
  const len = Math.min(a.length, b.length)
  let sum = 0
  for (let i = 0; i < len; i++) sum += a[i] * b[i]
  return sum
}

function averageEmbeddings(embeddings: Float32Array[]): Float32Array | null {
  if (!embeddings.length) return null
  const dim = embeddings[0].length
  const out = new Float32Array(dim)
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) out[i] += emb[i]
  }
  const n = embeddings.length
  for (let i = 0; i < dim; i++) out[i] /= n
  let norm = 0
  for (let i = 0; i < dim; i++) norm += out[i] * out[i]
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < dim; i++) out[i] /= norm
  return out
}

function findTagImageEntries(dbPath: string, metaId: number, tagId: number): Array<{type: string; absolutePath: string; sourcePath: string}> {
  const base = path.join(dbPath, 'meta', String(metaId))
  if (!fs.existsSync(base)) return []

  const prefix = `${tagId}_`
  const found = new Map<string, string>()
  for (const name of fs.readdirSync(base)) {
    if (!name.startsWith(prefix) || !/\.jpe?g$/i.test(name)) continue
    const absolute = path.join(base, name)
    if (!fs.statSync(absolute).isFile()) continue
    const suffix = name.slice(prefix.length).replace(/\.jpe?g$/i, '').toLowerCase()
    found.set(suffix, absolute)
  }

  const ordered: Array<{type: string; absolutePath: string; sourcePath: string}> = []
  const push = (type: string, absolutePath: string) => {
    ordered.push({
      type,
      absolutePath,
      sourcePath: path.relative(dbPath, absolutePath).split(path.sep).join('/'),
    })
  }

  for (const type of PREFERRED_IMAGE_TYPES) {
    const absolute = found.get(type)
    if (!absolute) continue
    push(type, absolute)
    found.delete(type)
  }
  for (const [type, absolute] of found) push(type, absolute)
  return ordered
}

function gradeFromIssues(issues: EnrollmentIssue[], detectScore: number | null): EnrollmentGrade {
  if (issues.includes('missing_file') || issues.includes('no_face')) return 'bad'
  if (issues.includes('not_enrolled') || issues.includes('low_score') || issues.includes('multi_face') || issues.includes('face_too_small')) {
    return 'weak'
  }
  if (detectScore != null && detectScore >= GOOD_DETECT_SCORE) return 'good'
  if (detectScore != null && detectScore >= LOW_DETECT_SCORE) return 'ok'
  return issues.length ? 'weak' : 'ok'
}

function gradeTag(images: EnrollmentImageQuality[], issues: EnrollmentIssue[]): EnrollmentGrade {
  if (!images.length && !issues.length) return 'none'
  if (issues.includes('no_face') || images.every((image) => image.grade === 'bad' || image.grade === 'none')) return 'bad'
  if (issues.includes('inconsistent') || issues.includes('confused') || images.some((image) => image.grade === 'weak' || image.grade === 'bad')) {
    return 'weak'
  }
  if (images.length && images.every((image) => image.grade === 'good')) return 'good'
  if (images.some((image) => image.grade === 'ok' || image.grade === 'good')) return 'ok'
  return 'weak'
}

function enrollmentMatchesPath(
  sourcePath: string | null | undefined,
  relativePath: string,
  absolutePath: string,
) {
  if (!sourcePath) return false
  const normalized = String(sourcePath).split(path.sep).join('/')
  return (
    normalized === relativePath
    || normalized === absolutePath.split(path.sep).join('/')
    || normalized.endsWith(`/${relativePath}`)
    || absolutePath.endsWith(normalized)
  )
}

async function analyzeImage(
  db: ApiDb,
  entry: {type: string; absolutePath: string; sourcePath: string},
  enrollments: Array<{sourcePath: string | null}>,
): Promise<EnrollmentImageQuality> {
  const exists = fs.existsSync(entry.absolutePath)
  const enrolled = enrollments.some((row) => enrollmentMatchesPath(row.sourcePath, entry.sourcePath, entry.absolutePath))
  const issues: EnrollmentIssue[] = []
  let faceCount = 0
  let detectScore: number | null = null
  let faceAreaRatio: number | null = null

  if (!exists) {
    issues.push('missing_file')
  } else {
    try {
      const model = await loadModel(db)
      const detections = await detectFacesInFrame(model, entry.absolutePath, {
        minScore: 0.4,
        maxFacesPerFrame: 5,
      })
      faceCount = detections.length
      if (!faceCount) {
        issues.push('no_face')
      } else {
        const best = detections.reduce((a, b) => (
          (a.box.width * a.box.height) >= (b.box.width * b.box.height) ? a : b
        ))
        detectScore = best.score
        const image = await Jimp.read(entry.absolutePath)
        const frameArea = Math.max(1, image.width * image.height)
        faceAreaRatio = (best.box.width * best.box.height) / frameArea
        if (detectScore < LOW_DETECT_SCORE) issues.push('low_score')
        if (faceCount > 1) issues.push('multi_face')
        if (faceAreaRatio < MIN_FACE_AREA_RATIO) issues.push('face_too_small')
      }
    } catch {
      issues.push('no_face')
    }
    if (!enrolled) issues.push('not_enrolled')
  }

  return {
    type: entry.type,
    sourcePath: entry.sourcePath,
    absolutePath: entry.absolutePath,
    exists,
    enrolled,
    faceCount,
    detectScore,
    faceAreaRatio,
    issues,
    grade: gradeFromIssues(issues, detectScore),
  }
}

function intraSimilarity(embeddings: Float32Array[]): number | null {
  if (embeddings.length < 2) return embeddings.length === 1 ? 1 : null
  let sum = 0
  let count = 0
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      sum += cosineSimilarity(embeddings[i], embeddings[j])
      count += 1
    }
  }
  return count ? sum / count : null
}

async function analyzeTagQuality(
  db: ApiDb,
  tagId: number,
  metaId: number,
  tagName: string | null,
  options: {
    centroids?: Map<number, {centroid: Float32Array; name: string | null}>
  } = {},
): Promise<EnrollmentTagQuality> {
  const dbPath = String(db.path || '')
  const enrollmentsRepo = createFaceEnrollmentsRepository(db.drizzle)
  const enrollments = enrollmentsRepo.findByTagId(tagId).filter((row) => Number(row.metaId) === metaId)
  const entries = dbPath ? findTagImageEntries(dbPath, metaId, tagId) : []
  const images: EnrollmentImageQuality[] = []
  for (const entry of entries) {
    images.push(await analyzeImage(db, entry, enrollments))
  }

  const embeddings = enrollments
    .map((row) => {
      try {
        return embeddingFromJson(String(row.embedding))
      } catch {
        return null
      }
    })
    .filter((item): item is Float32Array => Boolean(item))

  const consistency = intraSimilarity(embeddings)
  const issues: EnrollmentIssue[] = []
  for (const image of images) {
    for (const issue of image.issues) {
      if (!issues.includes(issue)) issues.push(issue)
    }
  }
  if (consistency != null && consistency < INTRA_WEAK) issues.push('inconsistent')
  if (!entries.length) {
    // no images on disk
  } else if (!enrollments.length) {
    if (!issues.includes('not_enrolled')) issues.push('not_enrolled')
  }

  let confusionScore: number | null = null
  let confusedWithTagId: number | null = null
  let confusedWithTagName: string | null = null
  const selfCentroid = averageEmbeddings(embeddings)
  if (selfCentroid && options.centroids?.size) {
    for (const [otherId, other] of options.centroids) {
      if (otherId === tagId) continue
      const score = cosineSimilarity(selfCentroid, other.centroid)
      if (confusionScore == null || score > confusionScore) {
        confusionScore = score
        confusedWithTagId = otherId
        confusedWithTagName = other.name
      }
    }
    if (confusionScore != null && confusionScore >= CONFUSION_WARN) {
      issues.push('confused')
    }
  }

  return {
    tagId,
    tagName,
    imageCount: entries.length,
    enrolledCount: enrollments.length,
    intraSimilarity: consistency,
    confusionScore,
    confusedWithTagId,
    confusedWithTagName,
    images,
    issues,
    grade: gradeTag(images, issues),
  }
}

async function getEnrollmentQualityForTag(db: ApiDb, tagId: number): Promise<EnrollmentTagQuality> {
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const tag = tagsRepo.findById(tagId)
  if (!tag) {
    return {
      tagId,
      tagName: null,
      imageCount: 0,
      enrolledCount: 0,
      intraSimilarity: null,
      confusionScore: null,
      confusedWithTagId: null,
      confusedWithTagName: null,
      images: [],
      issues: ['missing_file'],
      grade: 'none',
    }
  }
  const metaId = Number(tag.metaId)
  const settings = getFaceMatchSettings(db)
  const centroids = new Map<number, {centroid: Float32Array; name: string | null}>()
  if (settings.performerMetaId && metaId === settings.performerMetaId) {
    const enrollments = createFaceEnrollmentsRepository(db.drizzle).findByMetaId(metaId)
    const byTag = new Map<number, Float32Array[]>()
    for (const row of enrollments) {
      try {
        const emb = embeddingFromJson(String(row.embedding))
        const list = byTag.get(Number(row.tagId)) || []
        list.push(emb)
        byTag.set(Number(row.tagId), list)
      } catch {
        // skip bad rows
      }
    }
    for (const [id, list] of byTag) {
      const centroid = averageEmbeddings(list)
      if (!centroid) continue
      const other = tagsRepo.findById(id)
      centroids.set(id, {centroid, name: other?.name ?? null})
    }
  }

  return analyzeTagQuality(db, tagId, metaId, tag.name ?? null, {centroids})
}

async function* iterateEnrollmentQualityReport(
  db: ApiDb,
  {
    metaId,
    shouldStop = () => false,
  }: {
    metaId?: number | null
    shouldStop?: () => boolean
  } = {},
): AsyncGenerator<Record<string, unknown>> {
  const settings = getFaceMatchSettings(db)
  const resolvedMetaId = metaId && metaId > 0 ? metaId : settings.performerMetaId
  if (!resolvedMetaId) {
    yield {type: 'error', message: 'People category is not configured.'}
    return
  }

  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const tags = tagsRepo.findByMetaIds([resolvedMetaId])
  const enrollments = createFaceEnrollmentsRepository(db.drizzle).findByMetaId(resolvedMetaId)

  const byTag = new Map<number, Float32Array[]>()
  for (const row of enrollments) {
    try {
      const emb = embeddingFromJson(String(row.embedding))
      const list = byTag.get(Number(row.tagId)) || []
      list.push(emb)
      byTag.set(Number(row.tagId), list)
    } catch {
      // skip
    }
  }

  const centroids = new Map<number, {centroid: Float32Array; name: string | null}>()
  for (const tag of tags) {
    const list = byTag.get(Number(tag.id)) || []
    const centroid = averageEmbeddings(list)
    if (!centroid) continue
    centroids.set(Number(tag.id), {centroid, name: tag.name ?? null})
  }

  const total = tags.length
  let processed = 0
  let good = 0
  let ok = 0
  let weak = 0
  let bad = 0
  let none = 0

  yield {type: 'progress', processed, total, remaining: total, good, ok, weak, bad, none}

  // Warm detector once.
  try {
    await loadModel(db)
  } catch {
    yield {type: 'error', message: 'Face detection model is unavailable.'}
    return
  }

  for (const tag of tags) {
    if (shouldStop()) {
      yield {
        type: 'complete',
        processed,
        total,
        good,
        ok,
        weak,
        bad,
        none,
        stopped: true,
      }
      return
    }

    const result = await analyzeTagQuality(
      db,
      Number(tag.id),
      resolvedMetaId,
      tag.name ?? null,
      {centroids},
    )
    processed += 1
    if (result.grade === 'good') good += 1
    else if (result.grade === 'ok') ok += 1
    else if (result.grade === 'weak') weak += 1
    else if (result.grade === 'bad') bad += 1
    else none += 1

    yield {type: 'tag', tag: result}
    yield {
      type: 'progress',
      processed,
      total,
      remaining: Math.max(total - processed, 0),
      good,
      ok,
      weak,
      bad,
      none,
      current: tag.name || String(tag.id),
    }
  }

  yield {
    type: 'complete',
    processed,
    total,
    good,
    ok,
    weak,
    bad,
    none,
    stopped: false,
  }
}

export {
  getEnrollmentQualityForTag,
  iterateEnrollmentQualityReport,
}
