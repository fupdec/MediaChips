import fs from 'fs'
import path from 'path'
import type {ApiDb} from '../types/db'
import {projectPath} from '../../shared/projectRoot'
import {downloadHttpFile} from './httpFileDownload'
import {iterateTrackedHttpDownload, type DownloadProgressEvent} from './downloadProgress'

export type OrtModule = typeof import('onnxruntime-node')
export type OrtSession = import('onnxruntime-node').InferenceSession
export type OrtTensor = import('onnxruntime-node').Tensor

let ortModule: OrtModule | null = null

/** Lazy-load onnxruntime-node once for all face model services. */
export function getOrt(): OrtModule {
  if (!ortModule) ortModule = require('onnxruntime-node') as OrtModule
  return ortModule
}

export function getFaceModelsRoot(db: ApiDb): string {
  const base = db?.path_databases || process.app_folder || projectPath('app_storage')
  return path.join(base, 'models')
}

export function getFaceModelCacheDir(db: ApiDb, modelId: string): string {
  return path.join(getFaceModelsRoot(db), modelId)
}

export function resolveCachedModelPath(
  db: ApiDb,
  modelId: string,
  filename: string,
): string | null {
  const cached = path.join(getFaceModelCacheDir(db, modelId), filename)
  return fs.existsSync(cached) ? cached : null
}

export function downloadModelFile(
  url: string,
  destination: string,
  errorLabel: string,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<void> {
  return downloadHttpFile(url, destination, {errorLabel, onProgress})
}

export type EnsureCachedModelFileInput = {
  modelId: string
  filename: string
  url: string
  errorLabel: string
  onProgress?: (loaded: number, total: number | null) => void
}

export async function ensureCachedModelFile(
  db: ApiDb,
  input: EnsureCachedModelFileInput,
): Promise<{path: string; downloaded: boolean}> {
  const existing = resolveCachedModelPath(db, input.modelId, input.filename)
  if (existing) return {path: existing, downloaded: false}

  const cacheDir = getFaceModelCacheDir(db, input.modelId)
  fs.mkdirSync(cacheDir, {recursive: true})
  const destination = path.join(cacheDir, input.filename)
  await downloadModelFile(input.url, destination, input.errorLabel, input.onProgress)
  return {path: destination, downloaded: true}
}

export type CachedModelDownloadProgressEvent<Phase extends string = string> =
  Omit<DownloadProgressEvent, 'phase'> & {phase: Phase}

/** Yield byte progress while downloading a missing cached ORT model file. */
export async function* downloadCachedModelIfNeeded<Phase extends string>(
  db: ApiDb,
  input: EnsureCachedModelFileInput & {
    expectedBytes: number
    label: string
    phase: Phase
    shouldStop?: () => boolean
  },
): AsyncGenerator<CachedModelDownloadProgressEvent<Phase>> {
  if (resolveCachedModelPath(db, input.modelId, input.filename)) return

  const cacheDir = getFaceModelCacheDir(db, input.modelId)
  fs.mkdirSync(cacheDir, {recursive: true})
  const destination = path.join(cacheDir, input.filename)

  for await (const event of iterateTrackedHttpDownload({
    url: input.url,
    destination,
    expectedBytes: input.expectedBytes,
    errorLabel: input.errorLabel,
    label: input.label,
    shouldStop: input.shouldStop,
  })) {
    yield {
      ...event,
      phase: input.phase,
    }
  }
}
