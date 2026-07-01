import path from 'path'
import fs from 'fs'
import { normalizeMediaPath } from '../utils/normalizeUserPath'
import { pathVariants } from './contentHash'
import {
  getCachedResolvedPath,
  setCachedResolvedPath,
} from '../../app/server/resolvePathCache'

function resolveExistingPath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    for (const variant of pathVariants(candidate)) {
      if (fs.existsSync(variant)) {
        return variant
      }
    }
  }

  return null
}

function resolveActiveDbFilePath(filePath: string | null | undefined, dbPath: string | null | undefined) {
  if (!filePath) return null

  const normalizedPath = normalizeMediaPath(filePath)
  const cacheKey = dbPath ? `${dbPath}\0${normalizedPath}` : normalizedPath
  const cached = getCachedResolvedPath(cacheKey)
  if (cached) {
    return cached
  }

  const directMatch = resolveExistingPath(pathVariants(normalizedPath))
  if (directMatch) {
    setCachedResolvedPath(cacheKey, directMatch)
    return directMatch
  }

  if (path.isAbsolute(normalizedPath) && fs.existsSync(normalizedPath)) {
    setCachedResolvedPath(cacheKey, normalizedPath)
    return normalizedPath
  }

  if (!dbPath) return null

  const cleanPath = normalizedPath
    .replace(/^\/+/, '')
    .replace(/^.*(?:databases|app_storage)[\\/]+[a-f0-9]{12}[\\/]+/i, '')

  const resolved = resolveExistingPath([
    path.join(dbPath, 'media', cleanPath),
    path.join(dbPath, cleanPath),
    path.join(dbPath, 'meta', cleanPath),
    path.join(dbPath, 'media', normalizedPath),
    path.join(dbPath, normalizedPath),
  ])

  if (resolved) {
    setCachedResolvedPath(cacheKey, resolved)
  }

  return resolved
}

export {resolveActiveDbFilePath}

