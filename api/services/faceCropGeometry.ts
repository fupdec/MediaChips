import type {FaceBox} from '../types/faceDetector'

export const DEFAULT_FACE_CROP_PADDING = 0.2

export type CropRect = {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Pad a face box, expand to a square, then shift inward so the crop stays
 * inside the source frame.
 */
export function computePaddedSquareCropRect(
  box: FaceBox,
  imageWidth: number,
  imageHeight: number,
  padding = DEFAULT_FACE_CROP_PADDING,
): CropRect {
  const padX = box.width * padding
  const padY = box.height * padding
  let left = box.x - padX
  let top = box.y - padY
  let right = box.x + box.width + padX
  let bottom = box.y + box.height + padY

  const width = right - left
  const height = bottom - top
  const side = Math.max(width, height)
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  left = cx - side / 2
  top = cy - side / 2
  right = cx + side / 2
  bottom = cy + side / 2

  if (left < 0) {
    right -= left
    left = 0
  }
  if (top < 0) {
    bottom -= top
    top = 0
  }
  if (right > imageWidth) {
    left -= right - imageWidth
    right = imageWidth
  }
  if (bottom > imageHeight) {
    top -= bottom - imageHeight
    bottom = imageHeight
  }

  left = Math.max(0, Math.floor(left))
  top = Math.max(0, Math.floor(top))
  right = Math.min(imageWidth, Math.ceil(right))
  bottom = Math.min(imageHeight, Math.ceil(bottom))

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}
