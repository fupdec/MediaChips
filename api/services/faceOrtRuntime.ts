import fs from 'fs'
import http from 'http'
import https from 'https'
import path from 'path'
import type {ApiDb} from '../types/db'
import {projectPath} from '../../shared/projectRoot'

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
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const request = client.get(url, {
      headers: {
        'User-Agent': 'mediachips/1.0 (+https://github.com/fupdec/MediaChips)',
      },
    }, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume()
        downloadModelFile(response.headers.location, destination, errorLabel).then(resolve, reject)
        return
      }

      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Failed to download ${errorLabel} (HTTP ${response.statusCode})`))
        return
      }

      const tmpPath = `${destination}.download`
      const file = fs.createWriteStream(tmpPath)
      response.pipe(file)
      file.on('finish', () => {
        file.close(() => {
          try {
            fs.renameSync(tmpPath, destination)
            resolve()
          } catch (error) {
            reject(error)
          }
        })
      })
      file.on('error', (error) => {
        try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
        reject(error)
      })
    })

    request.on('error', reject)
  })
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
