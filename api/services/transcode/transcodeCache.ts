import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const activeCacheWrites = new Set<string>()

function buildCacheKey(filePath: string, stat: {mtimeMs: number; size: number}) {
  const payload = `${filePath}|${stat.mtimeMs}|${stat.size}`
  return crypto.createHash('sha256').update(payload).digest('hex')
}

function getCacheDir(databasesPath: string, dbId: string) {
  return path.join(databasesPath, dbId, 'transcode_cache')
}

function getCachePaths(databasesPath: string, dbId: string, cacheKey: string) {
  const cacheDir = getCacheDir(databasesPath, dbId)
  return {
    cacheDir,
    outputPath: path.join(cacheDir, `${cacheKey}.mp4`),
    metaPath: path.join(cacheDir, `${cacheKey}.json`),
    tempPath: path.join(cacheDir, `${cacheKey}.part.mp4`),
  }
}

function readCacheMeta(metaPath: string) {
  try {
    if (!fs.existsSync(metaPath)) return null
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  } catch {
    return null
  }
}

function writeCacheMeta(metaPath: string, meta: Record<string, unknown>) {
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
  if (meta.status === 'running') activeCacheWrites.add(metaPath)
  else activeCacheWrites.delete(metaPath)
}

function resolveExistingCache(databasesPath: string, dbId: string, filePath: string) {
  if (!filePath || !fs.existsSync(filePath)) return null

  const stat = fs.statSync(filePath)
  const cacheKey = buildCacheKey(filePath, stat)
  const {outputPath, metaPath} = getCachePaths(databasesPath, dbId, cacheKey)
  const meta = readCacheMeta(metaPath)

  if (meta?.status === 'done' && fs.existsSync(outputPath)) {
    return {cacheKey, outputPath, metaPath, meta, stat}
  }

  return {cacheKey, outputPath, metaPath, meta, stat, pending: true}
}

function ensureCacheDir(cacheDir: string) {
  fs.mkdirSync(cacheDir, {recursive: true})
}

function listCacheEntries(databasesPath: string, dbId: string) {
  const cacheDir = getCacheDir(databasesPath, dbId)
  if (!fs.existsSync(cacheDir)) return []

  const entries = []

  for (const fileName of fs.readdirSync(cacheDir)) {
    if (!fileName.endsWith('.json')) continue

    const metaPath = path.join(cacheDir, fileName)
    const meta = readCacheMeta(metaPath)
    if (!meta) continue

    const outputPath = path.join(cacheDir, `${meta.cacheKey}.mp4`)
    const size = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0

    entries.push({
      ...meta,
      outputPath,
      metaPath,
      size,
    })
  }

  return entries
}

function clearCacheExcept(databasesPath: string, dbId: string, keepCacheKey: string | null) {
  const cacheDir = getCacheDir(databasesPath, dbId)
  if (!fs.existsSync(cacheDir)) return 0

  let removed = 0

  for (const fileName of fs.readdirSync(cacheDir)) {
    if (keepCacheKey && fileName.startsWith(keepCacheKey)) continue

    try {
      fs.unlinkSync(path.join(cacheDir, fileName))
      removed += 1
    } catch (error) {
      console.error('Failed to remove transcode cache file:', error)
    }
  }

  return removed
}

/** Include orphaned outputs and failed jobs, while leaving active writers alone. */
function trimCacheToLimit(databasesPath: string, dbId: string, maxGb: number) {
  const configuredBytes = Number(maxGb) * 1024 * 1024 * 1024
  const maxBytes = Number.isFinite(configuredBytes) && configuredBytes > 0 ? configuredBytes : 2 * 1024 ** 3
  const cacheDir = getCacheDir(databasesPath, dbId)
  if (!fs.existsSync(cacheDir)) return {removed: 0, bytes: 0}
  const groups = new Map<string, {paths: string[]; at: number; running: boolean}>()
  let bytes = 0
  for (const name of fs.readdirSync(cacheDir)) {
    const filePath = path.join(cacheDir, name)
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) continue
    bytes += stat.size
    const key = name.replace(/(?:\.part)?\.mp4$|\.json$/, '')
    const group = groups.get(key) || {paths: [], at: stat.mtimeMs, running: false}
    group.paths.push(filePath)
    group.at = Math.max(group.at, stat.mtimeMs)
    if (name.endsWith('.json')) group.running = activeCacheWrites.has(filePath)
    groups.set(key, group)
  }
  let removed = 0
  for (const group of [...groups.values()].sort((a, b) => a.at - b.at)) {
    if (bytes <= maxBytes) break
    if (group.running) continue
    for (const filePath of group.paths) {
      try {
        const size = fs.statSync(filePath).size
        fs.unlinkSync(filePath)
        bytes -= size
        removed++
      } catch (error) {
        console.error('Failed to trim transcode cache file:', error)
      }
    }
  }
  return {removed, bytes}
}

function getCacheStats(databasesPath: string, dbId: string) {
  const cacheDir = getCacheDir(databasesPath, dbId)
  if (!fs.existsSync(cacheDir)) {
    return {bytes: 0, files: 0, entries: 0}
  }

  let bytes = 0
  let files = 0

  for (const fileName of fs.readdirSync(cacheDir)) {
    const filePath = path.join(cacheDir, fileName)

    try {
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) continue
      files += 1
      bytes += stat.size
    } catch (error) {
      console.error('Failed to stat transcode cache file:', error)
    }
  }

  const entries = listCacheEntries(databasesPath, dbId)
    .filter((entry) => entry.status === 'done' || entry.status === 'running').length

  return {bytes, files, entries}
}

function clearCache(databasesPath: string, dbId: string) {
  const cacheDir = getCacheDir(databasesPath, dbId)
  if (!fs.existsSync(cacheDir)) return {removed: 0, bytes: 0}

  const stats = getCacheStats(databasesPath, dbId)
  let removed = 0

  for (const fileName of fs.readdirSync(cacheDir)) {
    try {
      fs.unlinkSync(path.join(cacheDir, fileName))
      removed += 1
    } catch (error) {
      console.error('Failed to remove transcode cache file:', error)
    }
  }

  return {removed, bytes: stats.bytes}
}

export {
  buildCacheKey,
  getCacheDir,
  getCachePaths,
  readCacheMeta,
  writeCacheMeta,
  resolveExistingCache,
  ensureCacheDir,
  listCacheEntries,
  clearCacheExcept,
  getCacheStats,
  clearCache,
  trimCacheToLimit,
}

