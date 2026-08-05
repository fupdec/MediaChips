/**
 * @vitest-environment node
 *
 * Real SCRFD ORT inference. Skips when det_10g.onnx is not already cached —
 * never downloads in CI (HF network / flake risk).
 *
 * Opt-in model location:
 * - MEDIA_CHIPS_FACE_MODELS_ROOT/<scrfd-10g>/det_10g.onnx
 * - or <repo>/app_storage/models/scrfd-10g/det_10g.onnx
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {Jimp} from 'jimp'
import {projectPath} from '../../shared/projectRoot'
import type {ApiDb} from '../types/db'
import {
  FACE_MODEL_ID,
  detectFacesInFrame,
  hasDownloadedModel,
  loadModel,
} from './faceDetector'

const SCRFD_FILENAME = 'det_10g.onnx'

function resolveExistingScrfdModel(): string | null {
  const candidates = [
    process.env.MEDIA_CHIPS_FACE_MODELS_ROOT
      ? path.join(process.env.MEDIA_CHIPS_FACE_MODELS_ROOT, FACE_MODEL_ID, SCRFD_FILENAME)
      : null,
    projectPath('app_storage', 'models', FACE_MODEL_ID, SCRFD_FILENAME),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).size > 1_000_000) {
      return candidate
    }
  }
  return null
}

const modelSource = resolveExistingScrfdModel()
const describeIntegration = modelSource ? describe : describe.skip

describeIntegration('faceDetector integration (SCRFD)', () => {
  let tmpRoot = ''
  let blankFrame = ''
  let db: ApiDb

  beforeAll(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-face-int-'))
    const modelDir = path.join(tmpRoot, 'models', FACE_MODEL_ID)
    fs.mkdirSync(modelDir, {recursive: true})
    fs.copyFileSync(modelSource!, path.join(modelDir, SCRFD_FILENAME))

    blankFrame = path.join(tmpRoot, 'blank.jpg')
    const image = new Jimp({width: 160, height: 160, color: 0xff808080})
    await image.write(blankFrame as `${string}.${string}`)

    db = {path_databases: tmpRoot} as ApiDb
    expect(hasDownloadedModel(db)).toBe(true)
  }, 120_000)

  afterAll(() => {
    if (tmpRoot) fs.rmSync(tmpRoot, {recursive: true, force: true})
  })

  it('loads ORT session and runs detectFacesInFrame on a blank still', async () => {
    const model = await loadModel(db)
    const detections = await detectFacesInFrame(model, blankFrame, {
      minScore: 0.5,
      maxFacesPerFrame: 5,
    })
    expect(Array.isArray(detections)).toBe(true)
    // Solid gray frame should not yield confident faces.
    expect(detections.length).toBe(0)
  }, 120_000)
})
