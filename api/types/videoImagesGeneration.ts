import type { FfprobeInfo } from './tasks'

export type VideoImageType = 'preview' | 'grid' | 'marks'

export interface VideoGridOptions {
  input: string
  output: string
  cols: number
  rows: number
  width: number
}

export interface VideoImageItem {
  id?: unknown
  path?: string
  time?: number
  media?: { path?: string }
  Media?: { path?: string }
}

export type VideoImageGenerationStatus = 'created' | 'skipped' | 'missing' | 'failed'

export interface VideoImageGenerationResult {
  status: VideoImageGenerationStatus
  id: unknown
  path?: string
  message?: string
}

export interface VideoImageTypeStatus {
  total: number
  generated: number
  pending: number
}

export interface VideoImagesGenerationStatus {
  preview: VideoImageTypeStatus
  grid: VideoImageTypeStatus
  marks: VideoImageTypeStatus
}

export interface VideoImageGenerationOptions {
  shouldStop?: () => boolean
  force?: boolean
}

export interface VideoImageGenerationProgressEvent {
  type: string
  processed?: number
  total?: number
  remaining?: number
  created?: number
  skipped?: number
  missing?: number
  failed?: number
  current?: string
  lastStatus?: VideoImageGenerationStatus
  stopped?: boolean
  message?: string
}

export type FfprobeDurationInfo = Pick<FfprobeInfo, 'format'>
