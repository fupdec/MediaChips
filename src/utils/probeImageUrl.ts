import { isThumbUnavailable } from '@/utils/thumbSource'

function probeWithImageElement(url: string, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false)
      return
    }

    const image = new Image()
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
      image.onload = null
      image.onerror = null
      image.src = ''
    }

    const onAbort = () => {
      cleanup()
      resolve(false)
    }

    image.onload = () => {
      cleanup()
      resolve(!isThumbUnavailable(image.src))
    }
    image.onerror = () => {
      cleanup()
      resolve(false)
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    image.src = url
  })
}

/** Check whether an image URL is reachable without decoding the full bitmap when possible. */
export async function probeDisplayImageUrl(
  url: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!url || isThumbUnavailable(url)) return false
  if (signal?.aborted) return false

  if (url.startsWith('/api/get-file') || url.includes('/api/get-file?')) {
    try {
      const response = await fetch(url, { method: 'HEAD', signal })
      return response.ok
    } catch {
      return false
    }
  }

  return probeWithImageElement(url, signal)
}
