import type {Readable} from 'stream'

export function sourceOperation<T>(action: () => Promise<T>, signal?: AbortSignal, cancel: () => void = () => {}): Promise<T> {
  signal?.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const abort = () => { try { cancel() } finally { reject(signal?.reason) } }
    signal?.addEventListener('abort', abort, {once: true})
    void Promise.resolve().then(() => { signal?.throwIfAborted(); return action() })
      .then(resolve, reject).finally(() => signal?.removeEventListener('abort', abort))
  })
}

export function sourceStream(body: Readable, signal?: AbortSignal): Readable {
  const abort = () => body.destroy()
  const cleanup = () => signal?.removeEventListener('abort', abort)
  signal?.addEventListener('abort', abort, {once: true})
  body.once('close', cleanup)
  body.once('end', cleanup)
  if (signal?.aborted) { abort(); signal.throwIfAborted() }
  return body
}
