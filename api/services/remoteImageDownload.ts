import axios from 'axios'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_RETRIES = 3
const MIN_IMAGE_BYTES = 128

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAcceptableImageContentType(contentType: string): boolean {
  if (!contentType) return true
  return contentType.startsWith('image/') || contentType.includes('octet-stream')
}

function buildDownloadHeaders(url: string, referer?: string) {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'image/*,*/*;q=0.8',
    ...(referer ? {Referer: referer} : {}),
  }
}

export async function downloadRemoteImage(
  url: string,
  {retries = DEFAULT_RETRIES, timeoutMs = DEFAULT_TIMEOUT_MS} = {},
): Promise<Buffer> {
  const trimmedUrl = url.trim()
  if (!/^https?:\/\//i.test(trimmedUrl)) {
    throw new Error('Invalid image URL')
  }

  const parsedUrl = new URL(trimmedUrl)
  const refererCandidates = [
    `${parsedUrl.origin}/`,
    undefined,
  ]

  let lastError: unknown

  for (let attempt = 1; attempt <= retries; attempt++) {
    for (const referer of refererCandidates) {
      try {
        const response = await axios.get(trimmedUrl, {
          responseType: 'arraybuffer',
          timeout: timeoutMs,
          maxRedirects: 5,
          headers: buildDownloadHeaders(trimmedUrl, referer),
          validateStatus: (status) => status >= 200 && status < 300,
        })

        const contentType = String(response.headers['content-type'] || '').toLowerCase()
        if (!isAcceptableImageContentType(contentType)) {
          throw new Error(`Unexpected content type: ${contentType}`)
        }

        const buffer = Buffer.from(response.data)
        if (buffer.length < MIN_IMAGE_BYTES) {
          throw new Error(`Downloaded image is too small (${buffer.length} bytes)`)
        }

        return buffer
      } catch (error) {
        lastError = error
      }
    }

    if (attempt < retries) {
      await sleep(400 * attempt)
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error('Failed to download image')
}
