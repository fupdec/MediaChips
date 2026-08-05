import fs from 'fs'
import path from 'path'
import type {ApiDb} from '../types/db'
import {projectPath} from '../../shared/projectRoot'
import {downloadHttpFile} from './httpFileDownload'

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
): Promise<void> {
  return downloadHttpFile(url, destination, {errorLabel})
}

export type EnsureCachedModelFileInput = {
  modelId: string
  filename: string
  url: string
  errorLabel: string
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
  await downloadModelFile(input.url, destination, input.errorLabel)
  return {path: destination, downloaded: true}
}
