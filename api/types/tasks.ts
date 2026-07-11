import type { VideoImagesGenerationStatus } from './videoImagesGeneration'
import type { AnyRecord, ApiDb } from './db'
import type { ApiRequest, ApiResponse } from './http'

export interface ParserSettings {
  useML: boolean
  similarityThreshold: number
  folderWeight: number
  clusterThreshold: number
  preferLongestMatch: boolean
  matchPrecision: number
}

export type LazyService = () => AnyRecord

export interface TagSuggestionSample {
  score?: number
  mediaId?: unknown
  timestamp?: unknown
}

export interface TagSuggestionItem {
  key?: string
  confidence?: number
  samples?: TagSuggestionSample[]
  word?: string
  occurrences?: number
}

export interface ClassifyMediaResult {
  frames: number
  suggestions: TagSuggestionItem[]
}

export interface SuggestTagsResult {
  suggestions: TagSuggestionItem[]
  frames: unknown
  media: unknown
  model: unknown
}

export interface VideoClipTaggerService {
  suggestTagsFromVideoFrames(db: ApiDb, media: unknown, options: unknown): Promise<SuggestTagsResult>
  classifyMedia(db: ApiDb, item: unknown, options: unknown): Promise<ClassifyMediaResult>
  aggregateFrameResults(frames: unknown[], locale: string, existingTags: unknown): TagSuggestionItem[]
  getStatus(db: ApiDb): unknown
  loadModel(db: ApiDb): Promise<void>
  CLIP_MODEL: string
}

export interface EmbeddingModelService {
  getStatus(db: ApiDb, useML: boolean): unknown
  loadModel(db: ApiDb): Promise<void>
}

export interface ImageMediaService {
  processAndSaveImage(options: unknown): Promise<unknown>
}

export interface VideoImagesGenerationService {
  getVideoImagesGenerationStatus(db: ApiDb, dbPath: string | undefined): Promise<VideoImagesGenerationStatus>
  iterateVideoImagesGeneration(
    db: ApiDb,
    dbPath: string | undefined,
    imageType: string,
    options?: { shouldStop?: () => boolean; force?: boolean },
  ): AsyncIterable<Record<string, unknown>>
}

export interface FfprobeStream {
  codec_type?: string
  width?: number
  height?: number
  codec_name?: string
  nb_frames?: number
}

export interface FfprobeInfo {
  format: {
    duration: number
    bit_rate?: number
  }
  streams: FfprobeStream[]
}

export interface TaskControllerShared {
  db: ApiDb
  getDbPath: () => string | undefined
  dbPath: string | undefined
  withTimeout: (promise: Promise<unknown>, ms: number, label: string) => Promise<unknown>
  createStreamAbortSignal: (req: ApiRequest, res: ApiResponse) => () => boolean
  getParserSettings: (overrides?: Record<string, unknown>) => Promise<ParserSettings>
  getVideoClipTagger: () => VideoClipTaggerService
  getEmbeddingModel: () => EmbeddingModelService
  getImageMedia: () => ImageMediaService
  getVideoImagesGeneration: () => VideoImagesGenerationService
  resolveGeneratedFolderPath: (folderKey: string) => string | null
  createThumbMiddle: (pathToFile: string, id: unknown) => Promise<string>
  createThumbCustom: (
    timestamp: unknown,
    inputPath: string,
    outputPath: string,
    width: number,
  ) => Promise<unknown>
}

export interface AddMediaPayload {
  path?: string
  mediaTypeId?: number | string
  is_check_duplicates?: boolean
}

export interface StreamTaskEvent {
  type?: string
  message?: string
  percent?: number
  [key: string]: unknown
}
