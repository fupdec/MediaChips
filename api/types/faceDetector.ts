export interface FaceBox {
  x: number
  y: number
  width: number
  height: number
}

/** SCRFD / ArcFace 5-point landmarks: L-eye, R-eye, nose, L-mouth, R-mouth. */
export type FaceLandmark5 = [
  {x: number; y: number},
  {x: number; y: number},
  {x: number; y: number},
  {x: number; y: number},
  {x: number; y: number},
]

export interface FaceDetection {
  score: number
  box: FaceBox
  kps?: FaceLandmark5 | null
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
  /**
   * When false, post-detect matching only suggests performers and does not write tags.
   * Used when a review dialog will open so the user applies tags explicitly.
   */
  applyTags?: boolean
  /** Create Person N tags for large unlabeled face clusters in this run. */
  autoBlindTags?: boolean
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
  type: 'progress' | 'complete' | 'error' | 'status'
  phase?: 'downloading_embed' | 'embed_ready' | 'downloading_align' | 'downloading_detect' | 'detect_ready' | 'downloading_gender' | 'gender_ready'
  processed?: number
  total?: number | null
  remaining?: number
  created?: number
  skipped?: number
  missing?: number
  failed?: number
  faces?: number
  /** Person N tags created from unlabeled clusters during this run. */
  blindTags?: number
  current?: string
  message?: string
  sizeMb?: number
  percent?: number
  loaded?: number
  etaSeconds?: number | null
  stopped?: boolean
  mediaId?: number | string | null
}
