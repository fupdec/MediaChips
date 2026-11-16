/** Browser listings stay bounded; recursive imports request all metadata pages.
 * A truncated response without continuation must never count as a complete folder. */
export async function collectRemoteDirectoryPages<T>(options: {
  load: (pageToken?: string) => Promise<{entries: T[]; nextPageToken?: string; truncated?: boolean}>
  maxEntries?: number
  signal?: AbortSignal
}) {
  const entries: T[] = []
  const seen = new Set<string>()
  let pageToken: string | undefined
  let truncated = false
  do {
    options.signal?.throwIfAborted()
    const page = await options.load(pageToken)
    options.signal?.throwIfAborted()
    entries.push(...page.entries)
    pageToken = page.nextPageToken
    truncated = Boolean(pageToken || page.truncated)
    if (pageToken && seen.has(pageToken)) throw new Error('Source returned a repeated page. Refresh the folder.')
    if (pageToken) seen.add(pageToken)
  } while (pageToken && entries.length < (options.maxEntries ?? 5000))
  return {entries, truncated}
}
