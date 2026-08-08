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

/**
 * Fetch + decode an image into the browser HTTP/memory cache so next/prev
 * transitions and filmstrip paint do not wait on cold network.
 */
export function warmDisplayImageUrl(
  url: string,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    if (!url || isThumbUnavailable(url) || signal?.aborted) {
      resolve()
      return
    }

    const image = new Image()
    image.decoding = 'async'

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
      image.onload = null
      image.onerror = null
    }

    const finish = () => {
      cleanup()
      resolve()
    }

    const onAbort = () => finish()

    image.onload = () => {
      if (typeof image.decode === 'function') {
        image.decode().then(finish).catch(finish)
        return
      }
      finish()
    }
    image.onerror = finish

    signal?.addEventListener('abort', onAbort, {once: true})
    image.src = url
  })
}
