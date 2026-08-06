import type { ApiDb, AnyRecord } from '../types/db'
import type { MissingMediaSearchOptions } from '../types/missingMediaFinder'
import path from 'path'
import { stat } from 'fs/promises'
import { computeOshashForPath } from './oshash'
import { createMediaRepository } from '../db/repositories/media'
import { createMediaTypesRepository } from '../db/repositories/mediaTypes'
import { buildExtensionRegexFromMediaTypes } from '../utils/mediaExtensions'
import { buildMissingIndexes, pickWeakCandidate } from './missingMediaMatch'
import {walkMatchedMediaFiles} from './mediaFileWalk'
import {collectMissingMediaByPathExist} from './missingMediaExistScan'

async function loadMissingMedia(db: ApiDb, options: MissingMediaSearchOptions = {}) {
  const mediaRepo = createMediaRepository(db.drizzle)
  const {shouldStop = () => false, onProgress} = options
  const all = mediaRepo.findAllOrderedById()

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

  const allMedia = mediaRepo.findAllOrderedById()
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
  const knownPaths = new Set(
    mediaRepo.findPaths().map((item: string) => String(item || '').toLowerCase()),
  )

  const matchedMediaIds = new Set()
  const matches = []
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

    if (knownPaths.has(filePath.toLowerCase())) {
      if (scanned % 100 === 0) {
        yield {
          type: 'progress',
          phase: 'scanning',
          scanned,
          sizeMatched,
          missing: missingMedia.length,
          matched: matches.length,
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
          matched: matches.length,
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

    let match = null
    let confidence = null

    if (oshash && byOshash.has(oshash)) {
      const candidates = (byOshash.get(oshash) || [])
        .filter((item: AnyRecord) => !matchedMediaIds.has(item.id))
      if (candidates.length === 1) {
        match = candidates[0]
        confidence = 'oshash'
      } else if (candidates.length > 1) {
        const weak = pickWeakCandidate(candidates, filePath)
        if (weak) {
          match = weak
          confidence = 'oshash'
        }
      }
    }

    if (!match) {
      const candidates = (bySizeNoHash.get(filesize) || [])
        .filter((item: AnyRecord) => !matchedMediaIds.has(item.id))
      const weak = pickWeakCandidate(candidates, filePath)

      if (weak) {
        match = weak
        confidence = 'size'
      }
    }

    if (match && !matchedMediaIds.has(match.id)) {
      matchedMediaIds.add(match.id)

      const matchItem = {
        id: match.id,
        oldPath: match.path,
        newPath: filePath,
        confidence,
        oshash: oshash || match.oshash || null,
      }

      matches.push(matchItem)

      yield {
        type: 'match',
        match: matchItem,
        scanned,
        matched: matches.length,
      }
    }

    if (scanned % 20 === 0 || match) {
      yield {
        type: 'progress',
        phase: 'scanning',
        scanned,
        sizeMatched,
        missing: missingMedia.length,
        matched: matches.length,
        current: filePath,
      }
    }
  }

  yield {
    type: 'complete',
    scanned,
    sizeMatched,
    matched: matches.length,
    matches,
    missing: missingMedia.length,
    stopped: shouldStop(),
  }
}

export { getMissingMediaStatus, loadMissingMedia, iterateMissingMediaSearch }
