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

const negativeCache = new Map<string, number>()
const positiveCache = new Map<string, number>()

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
  negativeCache.set(filePath, Date.now() + NEGATIVE_CACHE_TTL_MS)
  positiveCache.delete(filePath)
}

function rememberPositiveResult(filePath: string) {
  positiveCache.set(filePath, Date.now() + POSITIVE_CACHE_TTL_MS)
  negativeCache.delete(filePath)
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
    rememberNegativeResult(filePath)
    return false
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

  const volumeRoot = getUnavailableVolumeRoot(filePath)
  if (volumeRoot && volumeRoot !== filePath) {
    const volumeExists = await checkFileExistsElectron(volumeRoot)
    if (volumeExists === false) {
      rememberNegativeResult(filePath)
      return false
    }
  }

  const electronResult = await checkFileExistsElectron(filePath)
  if (electronResult !== null) {
    if (electronResult) rememberPositiveResult(filePath)
    else rememberNegativeResult(filePath)
    return electronResult
  }

  if (!canCheckFileViaApi()) return false

  try {
    const exists = await queueFileExistenceCheck(filePath)
    if (exists) rememberPositiveResult(filePath)
    else rememberNegativeResult(filePath)
    return exists
  } catch {
    return checkFileExistsRemote(filePath)
  }
}

export function buildLocalFileUrl(
  imgPath: string,
  outside?: boolean,
  cacheBust = false,
): string {
  const params = new URLSearchParams()
  params.set('url', imgPath)
  if (outside) params.set('outside', '1')
  if (cacheBust) params.set('_t', String(Date.now()))

  const token = getAuthToken()
  if (token) params.set('token', token)

  return buildApiUrl(`${API_ROUTES.getFile}?${params.toString()}`)
}

export function getLocalImage(imgPath: string, outside?: boolean, cacheBust = false) {
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
  sizes: unknown,
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
