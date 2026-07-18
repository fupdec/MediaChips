import type { ApiDb, AnyRecord } from '../types/db'
import type { MissingMediaSearchOptions } from '../types/missingMediaFinder'
import path from 'path'
import { readdir, stat } from 'fs/promises'
import { fileExists } from './contentHash'
import { computeOshashForPath } from './oshash'
import { createMediaRepository } from '../db/repositories/media'
import { createMediaTypesRepository } from '../db/repositories/mediaTypes'

async function loadMissingMedia(db: ApiDb, options: MissingMediaSearchOptions = {}) {
  const mediaRepo = createMediaRepository(db.drizzle)
  const {shouldStop = () => false, onProgress} = options
  const all = mediaRepo.findAllOrderedById()

  const missing = []

  for (let index = 0; index < all.length; index += 1) {
    if (shouldStop()) break

    const item = all[index]
    if (!(await fileExists(item.path))) {
      missing.push(item)
    }

    if (onProgress && (index % 100 === 0 || index === all.length - 1)) {
      onProgress(index + 1, all.length)
    }
  }

  return missing
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

function buildExtensionRegex(mediaTypes: Array<{ extensions?: string }>) {
  const extensions = new Set()

  for (const mediaType of mediaTypes) {
    String(mediaType.extensions || '')
      .split(',')
      .map((ext: string) => ext.trim().toLowerCase())
      .filter(Boolean)
      .forEach((ext: string) => extensions.add(ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  if (!extensions.size) {
    return /\.[^./\\]+$/i
  }

  return new RegExp(`\\.(${Array.from(extensions).join('|')})$`, 'i')
}

async function* walkMediaFiles(
  rootDirs: string[],
  {extensionRegex, shouldStop = () => false}: {extensionRegex: RegExp; shouldStop?: () => boolean},
) {
  const stack = [...rootDirs]
  let scanned = 0

  while (stack.length && !shouldStop()) {
    const dir = stack.pop()
    if (!dir) continue
    let entries

    try {
      entries = await readdir(dir, {withFileTypes: true})
    } catch {
      continue
    }

    for (const entry of entries) {
      if (shouldStop()) return

      const filePath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        stack.push(filePath)
      } else if (entry.isFile() && extensionRegex.test(filePath)) {
        scanned += 1
        yield {path: filePath, scanned}

        if (scanned % 200 === 0) {
          await new Promise((resolve) => setImmediate(resolve))
        }
      }
    }
  }
}

function buildMissingIndexes(missingMedia: AnyRecord[]) {
  const byOshash = new Map()
  const bySizeNoHash = new Map()
  const targetSizes = new Set()

  for (const item of missingMedia) {
    const size = Number(item.filesize) || 0
    targetSizes.add(size)

    if (item.oshash) {
      if (!byOshash.has(item.oshash)) {
        byOshash.set(item.oshash, [])
      }
      byOshash.get(item.oshash).push(item)
      continue
    }

    if (!bySizeNoHash.has(size)) {
      bySizeNoHash.set(size, [])
    }
    bySizeNoHash.get(size).push(item)
  }

  return {byOshash, bySizeNoHash, targetSizes}
}

function pickWeakCandidate(candidates: AnyRecord[], foundPath: string) {
  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0]

  const foundBasename = path.basename(foundPath).toLowerCase()
  const basenameMatches = candidates.filter(
    (item) => path.basename(String(item.path)).toLowerCase() === foundBasename,
  )

  if (basenameMatches.length === 1) {
    return basenameMatches[0]
  }

  return null
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

  for (let index = 0; index < allMedia.length; index += 1) {
    if (shouldStop()) break

    const item = allMedia[index]

    if (!(await fileExists(item.path))) {
      missingMedia.push(item)
    }

    if (index % 100 === 0 || index === allMedia.length - 1) {
      yield {
        type: 'progress',
        phase: 'loading_missing',
        processed: index + 1,
        total: allMedia.length,
        missing: missingMedia.length,
        matched: 0,
      }
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
  const extensionRegex = buildExtensionRegex(mediaTypes as Array<{ extensions?: string }>)
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

  for await (const {path: filePath} of walkMediaFiles(rootDirs, {extensionRegex, shouldStop})) {
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
      const candidates = byOshash.get(oshash)
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
