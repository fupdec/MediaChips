export interface FaceBox {
  x: number
  y: number
  width: number
  height: number
}

export interface FaceDetection {
  score: number
  box: FaceBox
  timestamp: string | null
  cropPath: string | null
  cropRelativePath: string | null
  embedding?: string | null
}

export interface FaceDetectorMediaItem {
  id?: number | string | null
  path?: string | null
}

export interface FaceDetectorOptions {
  framesPerVideo?: number
  frameWidth?: number
  minScore?: number
  iouThreshold?: number
  maxFacesPerFrame?: number
  force?: boolean
  persist?: boolean
  /** Persist face crop JPEGs under media/videos/faces/{mediaId}. Manual review only. */
  persistCrops?: boolean
}

export interface FaceDetectorMediaResult {
  mediaId: number | string | null
  mediaPath: string | null
  frames: number
  faces: FaceDetection[]
  skipped?: boolean
  missing?: boolean
  failed?: boolean
  error?: string
}

export interface FaceDetectionGenerationStatus {
  total: number
  pending: number
  generated: number
  faces: number
}

export interface FaceDetectionProgressEvent {
  type: 'progress' | 'complete' | 'error'
  processed?: number
  total?: number
  remaining?: number
  created?: number
  skipped?: number
  missing?: number
  failed?: number
  faces?: number
  current?: string
  message?: string
  stopped?: boolean
  mediaId?: number | string | null
}
