import { API_ROUTES } from '@shared/api/routes'
import { normalizePastedFilePath } from '@/utils/filePathInput'
import { buildApiUrl, getApiBaseUrl } from '@/services/apiClient'
import { getAuthToken } from '@/services/authSession'
import { typedApi } from '@/services/typedApi'
import { checkFileExistsElectron, isElectron } from '@/services/electronBridge'
import { queueFileExistenceCheck } from '@/utils/fileExistenceBatcher'
import { isViteDevProxyMode } from '@/utils/apiBaseUrl'

const NEGATIVE_CACHE_TTL_MS = 60_000
const POSITIVE_CACHE_TTL_MS = 5 * 60_000
const FILE_EXISTS_CACHE_MAX = 2_000

const negativeCache = new Map<string, number>()
const positiveCache = new Map<string, number>()

function trimCache(map: Map<string, number>, max = FILE_EXISTS_CACHE_MAX) {
  while (map.size > max) {
    const oldest = map.keys().next().value
    if (oldest === undefined) break
    map.delete(oldest)
  }
}

function getUnavailableVolumeRoot(filePath: string) {
  if (!isElectron()) return null

  const normalized = filePath.replace(/\\/g, '/')
  const volumesMatch = normalized.match(/^\/Volumes\/([^/]+)(?:\/|$)/i)
  if (!volumesMatch) return null

  return `/Volumes/${volumesMatch[1]}`
}

function getCachedNegativeResult(filePath: string) {
  const expiresAt = negativeCache.get(filePath)
  if (!expiresAt) return null
  if (Date.now() >= expiresAt) {
    negativeCache.delete(filePath)
    return null
  }
  return false
}

function getCachedPositiveResult(filePath: string) {
  const expiresAt = positiveCache.get(filePath)
  if (!expiresAt) return null
  if (Date.now() >= expiresAt) {
    positiveCache.delete(filePath)
    return null
  }
  return true
}

function rememberNegativeResult(filePath: string) {
  negativeCache.delete(filePath)
  negativeCache.set(filePath, Date.now() + NEGATIVE_CACHE_TTL_MS)
  positiveCache.delete(filePath)
  trimCache(negativeCache)
}

function rememberPositiveResult(filePath: string) {
  positiveCache.delete(filePath)
  positiveCache.set(filePath, Date.now() + POSITIVE_CACHE_TTL_MS)
  negativeCache.delete(filePath)
  trimCache(positiveCache)
}

export function invalidateFileExistsCache(filePath?: string) {
  if (filePath) {
    negativeCache.delete(filePath)
    positiveCache.delete(filePath)
    return
  }

  negativeCache.clear()
  positiveCache.clear()
}

function canCheckFileViaApi() {
  // Vite dev uses an empty base URL so /api goes through the proxy.
  return isViteDevProxyMode() || Boolean(getApiBaseUrl())
}

async function checkFileExistsRemote(filePath: string) {
  if (!canCheckFileViaApi()) return false

  try {
    const response = await typedApi.checkFileExists(filePath)
    const exists = response.data?.exists === true
    if (exists) rememberPositiveResult(filePath)
    else rememberNegativeResult(filePath)
    return exists
  } catch {}

  try {
    const response = await typedApi.resolvePath(filePath)
    const exists = Boolean(response.data?.exists)
    if (exists) rememberPositiveResult(filePath)
    else rememberNegativeResult(filePath)
    return exists
  } catch {
    // Transient API/cold-start failures must not paint the whole grid as missing
    // (desaturated “black” cards) for NEGATIVE_CACHE_TTL_MS.
    return true
  }
}

export async function checkFileExists(filePath: string) {
  const normalized = normalizePastedFilePath(filePath)
  filePath = typeof normalized === 'string' ? normalized : filePath
  if (!filePath) return false

  const cachedNegative = getCachedNegativeResult(filePath)
  if (cachedNegative === false) return false

  const cachedPositive = getCachedPositiveResult(filePath)
  if (cachedPositive === true) return true

  // Cheap volume-root probe only: avoids per-card IPC storms while scrolling.
  const volumeRoot = getUnavailableVolumeRoot(filePath)
  if (volumeRoot && volumeRoot !== filePath) {
    const volumeExists = await checkFileExistsElectron(volumeRoot)
    if (volumeExists === false) {
      rememberNegativeResult(filePath)
      return false
    }
  }

  // Prefer batched HTTP like the browser; IPC only when the API is unavailable.
  if (canCheckFileViaApi()) {
    try {
      const exists = await queueFileExistenceCheck(filePath)
      if (exists) rememberPositiveResult(filePath)
      else rememberNegativeResult(filePath)
      return exists
    } catch {
      return checkFileExistsRemote(filePath)
    }
  }

  const electronResult = await checkFileExistsElectron(filePath)
  if (electronResult !== null) {
    if (electronResult) rememberPositiveResult(filePath)
    else rememberNegativeResult(filePath)
    return electronResult
  }

  return false
}

// Bump when /api/get-file caching semantics change so browsers drop stale
// responses previously stored under older Cache-Control policies.
const GET_FILE_CACHE_VERSION = '3'

export function buildLocalFileUrl(
  imgPath: string,
  outside?: boolean,
  cacheBust: boolean | number = false,
  options?: {maxEdge?: number},
): string {
  const params = new URLSearchParams()
  params.set('url', imgPath)
  params.set('cv', GET_FILE_CACHE_VERSION)
  if (outside) params.set('outside', '1')
  if (cacheBust === true) params.set('_t', String(Date.now()))
  else if (typeof cacheBust === 'number' && Number.isFinite(cacheBust)) {
    params.set('_t', String(cacheBust))
  }
  const maxEdge = Number(options?.maxEdge)
  if (Number.isFinite(maxEdge) && maxEdge >= 64 && maxEdge <= 8192) {
    params.set('maxEdge', String(Math.round(maxEdge)))
  }

  const token = getAuthToken()
  if (token) params.set('token', token)

  return buildApiUrl(`${API_ROUTES.getFile}?${params.toString()}`)
}

export function getLocalImage(
  imgPath: string,
  outside?: boolean,
  cacheBust: boolean | number = false,
) {
  if (!imgPath) return '/images/unavailable.png'

  return buildLocalFileUrl(imgPath, outside, cacheBust)
}

export async function createThumb(
  timestamp: number,
  inputPath: string,
  outputPath: string,
  width: number,
  overwrite?: boolean,
) {
  return typedApi.createThumb({
    timestamp,
    inputPath,
    outputPath,
    width,
    overwrite,
  })
}

export async function deleteLocalFile(filePath: string) {
  return typedApi.deleteLocalFile(filePath)
}

function resolveCreateImageUrl(image: string): string | null {
  const trimmed = image?.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`
  return null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function createImage(
  image: string,
  outputPath: string,
  sizes?: unknown,
) {
  const url = resolveCreateImageUrl(image)
  const maxAttempts = url ? 3 : 1
  let lastResponse

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastResponse = await typedApi.createImage({
      image,
      outputPath,
      url,
      sizes,
    })

    if (lastResponse.status === 201) {
      return lastResponse
    }

    if (attempt < maxAttempts) {
      await sleep(400 * attempt)
    }
  }

  return lastResponse!
}

/** Save the app's placeholder poster when a scraper has no usable image. */
export async function createUnavailableImage(
  outputPath: string,
  sizes?: unknown,
) {
  return createImage('/images/unavailable.png', outputPath, sizes)
}
