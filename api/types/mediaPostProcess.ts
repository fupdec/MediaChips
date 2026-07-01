import type { ApiDb } from './db'

export interface VideoMetadataResult {
  duration: number
  bitrate?: number
  width?: number
  height?: number
  codec?: string
  fps?: number
}

export interface AudioMetadataResult {
  duration: number
  bitrate?: number
  codec?: string
}

export interface ImageMetadataResult {
  width?: number
  height?: number
  orientation?: number
}

export interface ImageMediaHelper {
  getImageMetadata: (path: string) => Promise<ImageMetadataResult | null>
  createImageThumb: (path: string, id: unknown, dbPath: string | undefined) => Promise<void>
}

export interface MediaPostProcessorDeps {
  db: ApiDb
  dbPath: string | undefined
  getVideoMetadata: (pathToFile: string) => Promise<VideoMetadataResult | false>
  getAudioMetadata: (pathToFile: string) => Promise<AudioMetadataResult | false>
  getImageMedia: () => ImageMediaHelper
  createThumbMiddle: (pathToFile: string, id: unknown) => Promise<string>
  withTimeout: (promise: Promise<unknown>, ms: number, label: string) => Promise<unknown>
}

export type MediaTypeLike = string | { type?: string | null } | null | undefined

export type MediaId = number | string
