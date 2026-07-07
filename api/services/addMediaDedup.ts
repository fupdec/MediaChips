interface RegisteredDuplicate {
  id: number
  path: string
}

const registeredDuplicates = new Map<string, RegisteredDuplicate>()
const inFlightByKey = new Map<string, Promise<unknown>>()

export function buildMediaDuplicateKey(
  mediaTypeId: unknown,
  filesize: number,
  basename: string,
): string {
  return `${Number(mediaTypeId)}:${filesize}:${basename.toLowerCase()}`
}

export function findRegisteredDuplicate(key: string): RegisteredDuplicate | undefined {
  return registeredDuplicates.get(key)
}

export function registerDuplicateMedia(key: string, entry: RegisteredDuplicate): void {
  registeredDuplicates.set(key, entry)
}

export async function withDuplicateLookupLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  while (inFlightByKey.has(key)) {
    await inFlightByKey.get(key)
  }

  const promise = fn()
  inFlightByKey.set(key, promise)

  try {
    return await promise
  } finally {
    inFlightByKey.delete(key)
  }
}

export function resetAddMediaDedupState(): void {
  registeredDuplicates.clear()
  inFlightByKey.clear()
}
