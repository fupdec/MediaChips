import path from 'path'
import {cosineSimilarity} from './faceMatchScoring'
import {
  ENROLL_MIN_DETECT_SCORE,
  ENROLL_MIN_FACE_AREA_RATIO,
} from './enrollmentGates'

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

export type EnrollmentImageGradeInput = {
  grade: EnrollmentGrade
}

export const LOW_DETECT_SCORE = ENROLL_MIN_DETECT_SCORE
export const GOOD_DETECT_SCORE = 0.7
export const MIN_FACE_AREA_RATIO = ENROLL_MIN_FACE_AREA_RATIO
export const INTRA_WEAK = 0.4
export const CONFUSION_WARN = 0.55

export function gradeFromIssues(issues: EnrollmentIssue[], detectScore: number | null): EnrollmentGrade {
  if (issues.includes('missing_file') || issues.includes('no_face')) return 'bad'
  if (issues.includes('not_enrolled') || issues.includes('low_score') || issues.includes('multi_face') || issues.includes('face_too_small')) {
    return 'weak'
  }
  if (detectScore != null && detectScore >= GOOD_DETECT_SCORE) return 'good'
  if (detectScore != null && detectScore >= LOW_DETECT_SCORE) return 'ok'
  return issues.length ? 'weak' : 'ok'
}

export function gradeTag(
  images: EnrollmentImageGradeInput[],
  issues: EnrollmentIssue[],
): EnrollmentGrade {
  if (!images.length && !issues.length) return 'none'
  if (issues.includes('no_face') || images.every((image) => image.grade === 'bad' || image.grade === 'none')) return 'bad'
  if (issues.includes('inconsistent') || issues.includes('confused') || images.some((image) => image.grade === 'weak' || image.grade === 'bad')) {
    return 'weak'
  }
  if (images.length && images.every((image) => image.grade === 'good')) return 'good'
  if (images.some((image) => image.grade === 'ok' || image.grade === 'good')) return 'ok'
  return 'weak'
}

export function enrollmentMatchesPath(
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

export function intraSimilarity(embeddings: Float32Array[]): number | null {
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
