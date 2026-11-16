import type { ApiDb, AnyRecord } from '../types/db'
import type { MissingMediaSearchOptions } from '../types/missingMediaFinder'
import path from 'path'
import { stat } from 'fs/promises'
import { computeOshashForPath } from './oshash'
import { createMediaRepository } from '../db/repositories/media'
import { createMediaTypesRepository } from '../db/repositories/mediaTypes'
import { buildExtensionRegexFromMediaTypes } from '../utils/mediaExtensions'
import { buildMissingIndexes, findWeakCandidates } from './missingMediaMatch'
import {walkMatchedMediaFiles} from './mediaFileWalk'
import {collectMissingMediaByPathExist} from './missingMediaExistScan'
import {remapMediaRoot} from '../../shared/mediaRelink'
import {normalizeUserPath} from '../utils/normalizeUserPath'

async function loadMissingMedia(db: ApiDb, options: MissingMediaSearchOptions = {}) {
  const mediaRepo = createMediaRepository(db.drizzle)
  const {shouldStop = () => false, onProgress} = options
  const all = mediaRepo.findAllForMissingScanOrderedById()

  return collectMissingMediaByPathExist(all, {
    shouldStop,
    onProgress: onProgress
      ? (processed, total) => {
        onProgress(processed, total)
      }
      : undefined,
  })
}

async function getMissingMediaStatus(db: ApiDb, {full = false} = {}) {
  const mediaRepo = createMediaRepository(db.drizzle)
  const total = mediaRepo.countAll()

  if (!full) {
    return {
      total,
      missing: null,
      withHash: null,
      withoutHash: null,
    }
  }

  const missing = await loadMissingMedia(db)

  return {
    total,
    missing: missing.length,
    withHash: missing.filter((item: AnyRecord) => item.oshash).length,
    withoutHash: missing.filter((item: AnyRecord) => !item.oshash).length,
  }
}

async function* iterateMissingMediaSearch(db: ApiDb, options: MissingMediaSearchOptions = {}) {
  const mediaRepo = createMediaRepository(db.drizzle)
  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)
  const {
    folders = [],
    shouldStop = () => false,
  } = options

  const rootDirs = folders
    .map((folder) => path.resolve(String(folder)))
    .filter(Boolean)

  if (!rootDirs.length) {
    yield {type: 'error', message: 'No folders provided'}
    return
  }

  yield {type: 'phase', phase: 'loading_missing'}

  const originalFolder = normalizeUserPath(options.originalFolder)
  if (options.originalFolder !== undefined && (
    typeof originalFolder !== 'string' || !originalFolder ||
    (!path.posix.isAbsolute(originalFolder) && !path.win32.isAbsolute(originalFolder)) ||
    /^[\\/]+$/.test(originalFolder)
  )) {
    yield {type: 'error', message: 'Enter the absolute original folder path stored in the library'}
    return
  }
  const scopedFolder = typeof originalFolder === 'string' ? originalFolder : undefined
  const allMedia = mediaRepo.findAllForMissingScanOrderedById(scopedFolder)
    // LIKE is only a prefilter: verify the literal directory boundary before any disk access.
    .filter(item => !scopedFolder || remapMediaRoot(item.path || '', scopedFolder, '/candidate') !== null)
  const missingMedia = []
  // Chunked concurrent existence checks so the UI still gets progress events.
  const existChunkSize = 200

  for (let offset = 0; offset < allMedia.length; offset += existChunkSize) {
    if (shouldStop()) break

    const chunk = allMedia.slice(offset, offset + existChunkSize)
    const chunkMissing = await collectMissingMediaByPathExist(chunk, {shouldStop})
    missingMedia.push(...chunkMissing)

    yield {
      type: 'progress',
      phase: 'loading_missing',
      processed: Math.min(offset + chunk.length, allMedia.length),
      total: allMedia.length,
      missing: missingMedia.length,
      matched: 0,
    }
  }

  if (shouldStop()) {
    yield {
      type: 'complete',
      scanned: 0,
      matched: 0,
      matches: [],
      missing: missingMedia.length,
      stopped: true,
    }
    return
  }

  if (!missingMedia.length) {
    yield {
      type: 'complete',
      scanned: 0,
      matched: 0,
      matches: [],
      missing: 0,
    }
    return
  }

  const mediaTypes = mediaTypesRepo.findAll()
  const {byOshash, bySizeNoHash, targetSizes} = buildMissingIndexes(missingMedia)
  const extensionRegex = buildExtensionRegexFromMediaTypes(mediaTypes as Array<{ extensions?: string }>)
  const pathKey = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value
  const knownPaths = new Set(mediaRepo.findPaths().map((item: string) => pathKey(String(item || ''))))

  const candidatesById = new Map<number, {id: number; oldPath: string; confidence: string; candidatePaths: string[]}>()
  let scanned = 0
  let sizeMatched = 0

  yield {
    type: 'progress',
    phase: 'scanning',
    scanned,
    missing: missingMedia.length,
    matched: 0,
    current: rootDirs[0],
  }

  for await (const {path: filePath} of walkMatchedMediaFiles(rootDirs, {extensionRegex, shouldStop, yieldEvery: 200})) {
    if (shouldStop()) break

    scanned += 1

    if (knownPaths.has(pathKey(filePath))) {
      if (scanned % 100 === 0) {
        yield {
          type: 'progress',
          phase: 'scanning',
          scanned,
          sizeMatched,
          missing: missingMedia.length,
          matched: candidatesById.size,
          current: filePath,
        }
      }
      continue
    }

    let fileStat

    try {
      fileStat = await stat(filePath)
    } catch {
      continue
    }

    const filesize = fileStat.size

    if (!targetSizes.has(filesize)) {
      if (scanned % 100 === 0) {
        yield {
          type: 'progress',
          phase: 'scanning',
          scanned,
          sizeMatched,
          missing: missingMedia.length,
          matched: candidatesById.size,
          current: filePath,
        }
      }
      continue
    }

    sizeMatched += 1

    let oshash: string | null = null

    try {
      if (byOshash.size > 0) {
        oshash = await computeOshashForPath(filePath)
      }
    } catch {
      // continue with size/name matching
    }

    const strongCandidates = oshash ? byOshash.get(oshash) || [] : []
    const weakCandidates = findWeakCandidates(bySizeNoHash.get(filesize) || [], filePath)
    // Keep every candidate; filesystem traversal order must never choose the original.
    const candidates = strongCandidates.length ? strongCandidates : weakCandidates
    for (const candidate of candidates) {
      const id = Number(candidate.id)
      const entry = candidatesById.get(id) || {
        id,
        oldPath: String(candidate.path),
        confidence: strongCandidates.length ? 'oshash' : 'size',
        candidatePaths: [],
      }
      if (!entry.candidatePaths.includes(filePath)) entry.candidatePaths.push(filePath)
      candidatesById.set(id, entry)
    }

    if (scanned % 20 === 0 || candidates.length) {
      yield {
        type: 'progress',
        phase: 'scanning',
        scanned,
        sizeMatched,
        missing: missingMedia.length,
        matched: candidatesById.size,
        current: filePath,
      }
    }
  }

  const pathCounts = new Map<string, number>()
  for (const entry of candidatesById.values()) {
    for (const candidatePath of entry.candidatePaths) pathCounts.set(candidatePath, (pathCounts.get(candidatePath) || 0) + 1)
  }
  const matches = [...candidatesById.values()].map((entry) => {
    const ambiguous = shouldStop() || entry.candidatePaths.length > 1 || entry.candidatePaths.some((p) => (pathCounts.get(p) || 0) > 1)
    return {...entry, ambiguous, newPath: ambiguous ? '' : entry.candidatePaths[0]}
  })

  yield {
    type: 'complete',
    scanned,
    sizeMatched,
    matched: candidatesById.size,
    matches,
    missing: missingMedia.length,
    stopped: shouldStop(),
  }
}

export { getMissingMediaStatus, loadMissingMedia, iterateMissingMediaSearch }
