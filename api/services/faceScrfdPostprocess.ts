/** Pure SCRFD letterbox + candidate postprocess (no ORT / Jimp). */

import type {FaceBox, FaceLandmark5} from '../types/faceDetector'
import {
  SCRFD_NUM_ANCHORS,
  SCRFD_STRIDES,
  getAnchorCenters,
  scoreAt,
  tensorAsRows,
  type OrtTensorLike,
} from './faceScrfdDecode'

/** Ignore tiny boxes — usually body/skin false positives on low-res frames. */
export const MIN_FACE_SIDE_PX = 48
export const MIN_FACE_SIDE_RATIO = 0.04
export const MAX_FACE_ASPECT = 1.85

export type ScrfdCandidate = {
  score: number
  box: FaceBox
  kps: FaceLandmark5 | null
}

export function computeScrfdLetterboxSize(
  width: number,
  height: number,
  inputSize = 640,
): {newWidth: number; newHeight: number; detScale: number} {
  const imRatio = height / Math.max(width, 1)
  const modelRatio = 1
  let newWidth: number
  let newHeight: number
  if (imRatio > modelRatio) {
    newHeight = inputSize
    newWidth = Math.max(1, Math.round(newHeight / imRatio))
  } else {
    newWidth = inputSize
    newHeight = Math.max(1, Math.round(newWidth * imRatio))
  }
  const detScale = newHeight / Math.max(height, 1)
  return {newWidth, newHeight, detScale}
}

export function passesScrfdGeometryGates(
  box: FaceBox,
  frameW: number,
  frameH: number,
  options: {
    maxAreaRatio: number
    minSidePx?: number
    minSideRatio?: number
    maxAspect?: number
  },
): boolean {
  const boxWidth = box.width
  const boxHeight = box.height
  if (boxWidth < 1 || boxHeight < 1) return false

  const minSidePx = options.minSidePx ?? MIN_FACE_SIDE_PX
  const minSideRatio = options.minSideRatio ?? MIN_FACE_SIDE_RATIO
  const maxAspect = options.maxAspect ?? MAX_FACE_ASPECT
  const minSide = Math.min(boxWidth, boxHeight)
  const maxSide = Math.max(boxWidth, boxHeight)
  const frameMin = Math.min(frameW, frameH)
  if (minSide < minSidePx && minSide < frameMin * minSideRatio) return false
  if (maxSide / Math.max(minSide, 1) > maxAspect) return false
  const frameArea = Math.max(1, frameW * frameH)
  if ((boxWidth * boxHeight) / frameArea > options.maxAreaRatio) return false
  return true
}

export function collectScrfdCandidates(input: {
  outputs: Record<string, OrtTensorLike | undefined>
  outputNames: readonly string[]
  detScale: number
  width: number
  height: number
  inputSize: number
  minScore: number
  maxAreaRatio: number
  acceptBox?: (box: FaceBox, score: number) => boolean
}): ScrfdCandidate[] {
  const {
    outputs,
    outputNames: names,
    detScale,
    width,
    height,
    inputSize,
    minScore,
    maxAreaRatio,
    acceptBox,
  } = input

  const fmc = 3
  const useKps = names.length >= 9
  const candidates: ScrfdCandidate[] = []

  for (let idx = 0; idx < fmc; idx++) {
    const stride = SCRFD_STRIDES[idx]
    const scoreTensor = outputs[names[idx]]
    const bboxTensor = outputs[names[idx + fmc]]
    const kpsTensor = useKps ? outputs[names[idx + fmc * 2]] : null
    if (!scoreTensor || !bboxTensor) continue

    const featH = Math.floor(inputSize / stride)
    const featW = Math.floor(inputSize / stride)
    const centers = getAnchorCenters(featH, featW, stride)
    const expected = featH * featW * SCRFD_NUM_ANCHORS

    const scores = tensorAsRows(scoreTensor, 1)
    const bboxes = tensorAsRows(bboxTensor, 4)
    const kpsRows = kpsTensor ? tensorAsRows(kpsTensor, 10) : null
    const n = Math.min(expected, scores.rows, bboxes.rows, kpsRows ? kpsRows.rows : expected)

    for (let i = 0; i < n; i++) {
      const score = scoreAt(scoreTensor, i)
      if (!(score >= minScore)) continue

      const cx = centers[i * 2]
      const cy = centers[i * 2 + 1]
      const d0 = bboxes.data[i * 4] * stride
      const d1 = bboxes.data[i * 4 + 1] * stride
      const d2 = bboxes.data[i * 4 + 2] * stride
      const d3 = bboxes.data[i * 4 + 3] * stride

      let x1 = (cx - d0) / detScale
      let y1 = (cy - d1) / detScale
      let x2 = (cx + d2) / detScale
      let y2 = (cy + d3) / detScale

      x1 = Math.max(0, Math.min(width, x1))
      y1 = Math.max(0, Math.min(height, y1))
      x2 = Math.max(0, Math.min(width, x2))
      y2 = Math.max(0, Math.min(height, y2))

      const boxWidth = x2 - x1
      const boxHeight = y2 - y1
      const box = {x: x1, y: y1, width: boxWidth, height: boxHeight}
      if (!passesScrfdGeometryGates(box, width, height, {maxAreaRatio})) continue
      if (acceptBox && !acceptBox(box, score)) continue

      let kps: FaceLandmark5 | null = null
      if (kpsRows) {
        const base = i * 10
        const points = [0, 1, 2, 3, 4].map((p) => ({
          x: (cx + kpsRows.data[base + p * 2] * stride) / detScale,
          y: (cy + kpsRows.data[base + p * 2 + 1] * stride) / detScale,
        }))
        kps = points as FaceLandmark5
      }

      candidates.push({score, box, kps})
    }
  }

  return candidates
}
