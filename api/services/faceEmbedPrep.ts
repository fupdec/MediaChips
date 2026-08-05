import type { FaceBox } from '../types/faceDetector'
import { packInterleavedRgbToNchw } from './faceTensorPrep'

/** InsightFace r50 embed input size / normalization. */
export const EMBED_SIZE = 112
export const EMBED_INPUT_MEAN = 127.5
export const EMBED_INPUT_STD = 127.5

/** Prefer landmark-aligned crop when the stored box looks usable. */
export function shouldAlignForEmbed(box?: FaceBox | null): boolean {
  return Boolean(box && Number(box.width) > 1 && Number(box.height) > 1)
}

/** Pack interleaved RGB into the float32 NCHW tensor payload for the embed model. */
export function buildEmbedFloatData(
  rgb: ArrayLike<number>,
  width: number,
  height: number,
): Float32Array {
  return packInterleavedRgbToNchw(
    rgb,
    width,
    height,
    EMBED_INPUT_MEAN,
    EMBED_INPUT_STD,
  )
}
