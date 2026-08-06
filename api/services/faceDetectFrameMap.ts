import {mapWithConcurrency} from './thumbEncoding'

/** Bounded concurrent SCRFD runs per media (peak RSS vs wall-clock). */
export const DETECT_FRAME_CONCURRENCY = 2

export type DetectedFrameBatch<TFrame, TDetection, TImage> = {
  frame: TFrame
  detections: TDetection[]
  sourceImage: TImage | null
}

/**
 * Run per-frame detection (+ optional image load) with bounded concurrency.
 * Results stay in input frame order for stable crop indexing afterward.
 */
export async function mapDetectFramesWithConcurrency<
  TFrame extends {framePath: string},
  TDetection,
  TImage,
>(
  frames: TFrame[],
  options: {
    concurrency?: number
    detect: (frame: TFrame) => Promise<TDetection[]>
    readImage: (framePath: string) => Promise<TImage>
  },
): Promise<Array<DetectedFrameBatch<TFrame, TDetection, TImage>>> {
  const concurrency = options.concurrency ?? DETECT_FRAME_CONCURRENCY
  return mapWithConcurrency(frames, concurrency, async (frame) => {
    const detections = await options.detect(frame)
    const sourceImage = detections.length
      ? await options.readImage(frame.framePath)
      : null
    return {frame, detections, sourceImage}
  })
}
