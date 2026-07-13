import type { Express, Request, Response, Router, NextFunction } from 'express'
import type { ApiDb } from '../../api/types/db'
import type { ServerConfig, RouteLoadError } from './server'

export type BuiltinRequest = Request
export type BuiltinResponse = Response
export type BuiltinNext = NextFunction

export interface FileResolverResult {
  error?: { status: number; body: Record<string, unknown> }
  video?: { path?: string; id?: unknown }
  videoPath?: string
}

export type ResolveFilePathFn = (filePath: string) => string | null
export type GetStreamContentTypeFn = (filePath: string) => string

export interface TranscodePlaybackPlan {
  mode?: string
  transcodeRequired?: boolean
  transcodeEnabled?: boolean
  transcodeStatus?: string
  streamPlayback?: boolean
  remuxCopy?: boolean
  progress?: number
  error?: unknown
  reason?: string
  playability?: unknown
}

export interface TranscodeStreamInfo {
  filePath?: string
  contentType?: string
  plan?: { transcodeStatus?: string }
}

export interface TranscodeStatus {
  streamPlayback?: boolean
  [key: string]: unknown
}

export interface TranscodeManager {
  getPlaybackPlan(videoPath: string): Promise<TranscodePlaybackPlan>
  stopAllLiveStreams(): void
  stopLiveStream(videoPath: string): boolean
  streamLive(
    req: Request,
    res: Response,
    videoPath: string,
    options: { startTime: number; maxHeight?: number; copyCodecs?: boolean },
  ): Promise<void>
  getTranscodeStatus(videoPath: string): Promise<TranscodeStatus>
  getCacheStatsForActiveDb(): Record<string, unknown>
  clearCacheForActiveDb(): Record<string, unknown>
  resolveStreamPath(videoPath: string, source: string): Promise<TranscodeStreamInfo>
}

export interface BuiltinRoutesOptions {
  app: Express
  router: Router
  config: ServerConfig
  configPath: string
  databasesPath: string
  db: ApiDb
  routeLoadErrors: RouteLoadError[]
  resolveFilePath: ResolveFilePathFn
  getStreamContentType: GetStreamContentTypeFn
  transcodeManager: TranscodeManager | null
}

export type { Express, ServerConfig, RouteLoadError }
