import fs from 'fs'
import http from 'http'
import https from 'https'
import path from 'path'
import {isTransientDownloadError} from './realesrganDownload'

export const MEDIACHIPS_DOWNLOAD_USER_AGENT =
  'mediachips/1.0 (+https://github.com/fupdec/MediaChips)'

export type DownloadAbortSignal = AbortSignal | {aborted: boolean}

export type DownloadHttpFileOptions = {
  errorLabel?: string
  headers?: Record<string, string>
  onProgress?: (loaded: number, total: number | null) => void
  signal?: DownloadAbortSignal
  timeoutMs?: number
  minBytes?: number
  maxRedirects?: number
  /** Internal redirect recursion counter. */
  redirectDepth?: number
}

export type DownloadHttpFileRetryOptions = DownloadHttpFileOptions & {
  attempts?: number
  /** Base delay; attempt n waits `base * n * n` ms. */
  retryDelayMs?: number
  retryErrorMessage?: (detail: string, attempts: number) => string
}

function isAborted(signal?: DownloadAbortSignal): boolean {
  return Boolean(signal?.aborted)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function unlinkQuiet(filePath: string) {
  try { fs.unlinkSync(filePath) } catch { /* ignore */ }
}

/** Resolve absolute or relative redirect targets against the request URL. */
export function resolveDownloadRedirectUrl(currentUrl: string, location: string): string {
  return new URL(String(location || ''), currentUrl).href
}

/**
 * Atomic HTTP(S) download to `destination` via `${destination}.download` + rename.
 */
export function downloadHttpFile(
  url: string,
  destination: string,
  options: DownloadHttpFileOptions = {},
): Promise<void> {
  const {
    errorLabel = 'file',
    headers = {},
    onProgress,
    signal,
    timeoutMs,
    minBytes,
    maxRedirects = 32,
    redirectDepth = 0,
  } = options

  return new Promise((resolve, reject) => {
    if (redirectDepth > maxRedirects) {
      reject(new Error(`Too many redirects while downloading ${errorLabel}`))
      return
    }

    if (isAborted(signal)) {
      reject(new Error('aborted'))
      return
    }

    const client = url.startsWith('https') ? https : http
    const request = client.get(url, {
      headers: {
        'User-Agent': MEDIACHIPS_DOWNLOAD_USER_AGENT,
        ...headers,
      },
      ...(timeoutMs != null ? {timeout: timeoutMs} : {}),
    }, (response) => {
      if (isAborted(signal)) {
        response.resume()
        reject(new Error('aborted'))
        return
      }

      if (
        response.statusCode
        && response.statusCode >= 300
        && response.statusCode < 400
        && response.headers.location
      ) {
        response.resume()
        const nextUrl = resolveDownloadRedirectUrl(url, response.headers.location)
        downloadHttpFile(nextUrl, destination, {
          ...options,
          redirectDepth: redirectDepth + 1,
        }).then(resolve, reject)
        return
      }

      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Failed to download ${errorLabel} (HTTP ${response.statusCode})`))
        return
      }

      const total = Number(response.headers['content-length'] || 0) || null
      let loaded = 0
      const tmpPath = `${destination}.download`
      const file = fs.createWriteStream(tmpPath)
      let settled = false

      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        unlinkQuiet(tmpPath)
        reject(error instanceof Error ? error : new Error(String(error)))
      }

      response.on('data', (chunk: Buffer) => {
        if (isAborted(signal)) {
          request.destroy()
          file.destroy()
          fail(new Error('aborted'))
          return
        }
        loaded += chunk.length
        onProgress?.(loaded, total)
      })

      response.pipe(file)

      file.on('finish', () => {
        file.close(() => {
          if (settled) return
          try {
            if (minBytes != null) {
              const size = fs.statSync(tmpPath).size
              if (size < minBytes) {
                unlinkQuiet(tmpPath)
                settled = true
                reject(new Error(`Downloaded ${errorLabel} is too small (${size} bytes)`))
                return
              }
            }
            fs.renameSync(tmpPath, destination)
            settled = true
            resolve()
          } catch (error) {
            fail(error)
          }
        })
      })
      file.on('error', fail)
      response.on('error', fail)
    })

    if (timeoutMs != null) {
      request.on('timeout', () => {
        request.destroy(new Error(`Download timed out after ${timeoutMs / 1000}s`))
      })
    }
    request.on('error', reject)
  })
}

export async function downloadHttpFileWithRetries(
  url: string,
  destination: string,
  options: DownloadHttpFileRetryOptions = {},
): Promise<void> {
  const {
    attempts = 4,
    retryDelayMs = 1000,
    retryErrorMessage,
    ...downloadOptions
  } = options

  fs.mkdirSync(path.dirname(destination), {recursive: true})

  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await downloadHttpFile(url, destination, downloadOptions)
      return
    } catch (error) {
      lastError = error
      for (const stale of [`${destination}.download`, destination]) {
        unlinkQuiet(stale)
      }
      if (attempt >= attempts || !isTransientDownloadError(error)) {
        break
      }
      await sleep(retryDelayMs * attempt * attempt)
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError)
  if (retryErrorMessage) {
    throw new Error(retryErrorMessage(detail, attempts))
  }
  throw new Error(
    `Failed to download ${downloadOptions.errorLabel || 'file'} after ${attempts} attempts (${detail})`,
  )
}
