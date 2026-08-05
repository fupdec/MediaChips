import {describe, expect, it} from 'vitest'
import {
  buildDetectedFaceEntry,
  buildEmptyFaceDetectResult,
  buildFailedFaceDetectResult,
  buildMissingFaceDetectResult,
  buildSkippedExistingFaceResult,
  mapDetectionsToPersistedFaceRows,
  resolveDetectCropOutputPaths,
  shouldAttemptDetectionEmbedding,
  shouldPrepareGenderFilter,
} from './faceDetectPersist'
import {FACE_CROPS_RELATIVE_ROOT} from './faceCropStore'
import path from 'path'

describe('resolveDetectCropOutputPaths', () => {
  it('prefers facesDir for review crops', () => {
    expect(resolveDetectCropOutputPaths({
      facesDir: '/db/faces/1',
      tmpDir: '/tmp',
      filename: 'face_000.jpg',
      mediaId: 1,
    })).toEqual({
      absoluteCrop: path.join('/db/faces/1', 'face_000.jpg'),
      cropRelativePath: path.join(FACE_CROPS_RELATIVE_ROOT, '1', 'face_000.jpg'),
    })
  })

  it('falls back to tmpDir without a relative path', () => {
    expect(resolveDetectCropOutputPaths({
      facesDir: null,
      tmpDir: '/tmp',
      filename: 'face_000.jpg',
      mediaId: 1,
    })).toEqual({
      absoluteCrop: path.join('/tmp', 'face_000.jpg'),
      cropRelativePath: null,
    })
  })
})

describe('mapDetectionsToPersistedFaceRows', () => {
  it('nulls crop paths when persistCrops is false', () => {
    const rows = mapDetectionsToPersistedFaceRows(9, [{
      timestamp: '0:01',
      score: 0.8,
      box: {x: 1, y: 2, width: 3, height: 4},
      cropRelativePath: 'media/videos/faces/9/a.jpg',
      embedding: '[]',
    }], false)
    expect(rows[0]).toMatchObject({
      mediaId: 9,
      cropPath: null,
      embedding: '[]',
      x: 1,
    })
  })
})

describe('buildSkippedExistingFaceResult', () => {
  it('maps stored rows into skipped detection payload', () => {
    const result = buildSkippedExistingFaceResult({
      mediaId: 3,
      mediaPath: '/a.mp4',
      dbPath: '/db',
      existing: [{
        score: 0.5,
        x: 1,
        y: 2,
        width: 10,
        height: 12,
        timestamp: '00:00:01',
        cropPath: 'media/videos/faces/3/face.jpg',
      }],
    })
    expect(result.skipped).toBe(true)
    expect(result.faces[0].cropPath).toBe(path.join('/db', 'media/videos/faces/3/face.jpg'))
    expect(result.faces[0].box).toEqual({x: 1, y: 2, width: 10, height: 12})
  })
})

describe('detect result helpers', () => {
  it('builds missing / empty / failed payloads', () => {
    expect(buildMissingFaceDetectResult(1, '/a')).toMatchObject({missing: true, faces: []})
    expect(buildEmptyFaceDetectResult(1, '/a')).toEqual({mediaId: 1, mediaPath: '/a', frames: 0, faces: []})
    expect(buildFailedFaceDetectResult(1, '/a', new Error('x'))).toMatchObject({
      failed: true,
      error: 'x',
    })
  })

  it('gates embedding attempts and builds detection entries', () => {
    expect(shouldAttemptDetectionEmbedding({
      matchableOk: true,
      absoluteCrop: '/c.jpg',
      cropExists: true,
      hasEmbedApi: true,
    })).toBe(true)
    expect(shouldAttemptDetectionEmbedding({
      matchableOk: false,
      absoluteCrop: '/c.jpg',
      cropExists: true,
      hasEmbedApi: true,
    })).toBe(false)

    expect(buildDetectedFaceEntry({
      score: 0.9,
      box: {x: 1, y: 2, width: 3, height: 4},
      kps: null,
      timestamp: '0:01',
      cropPath: '/abs',
      cropRelativePath: 'rel',
      embedding: '[]',
    })).toMatchObject({
      score: 0.9,
      cropRelativePath: 'rel',
      embedding: '[]',
    })

    expect(shouldPrepareGenderFilter('both')).toBe(false)
    expect(shouldPrepareGenderFilter('female')).toBe(true)
  })
})
