import {normalizePastedFilePathsText} from '@/utils/filePathInput'

export type RemoteImportOptions = {
  parseTags: boolean
  excluded: string
}

export const defaultRemoteImportOptions = (): RemoteImportOptions => ({
  parseTags: true, excluded: '',
})

/** Match path fragments as in the local media file walker. */
export function remotePathExcluder(options: RemoteImportOptions): (path: string) => boolean {
  const excluded = String(normalizePastedFilePathsText(options.excluded) || '')
    .split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  return path => excluded.some(fragment => path.includes(fragment))
}

/** An omitted filter is used by standalone connection browsers. An empty filter
 * from Add media means there are no configured extensions to import. */
export function importExtensionMatcher(extensions?: string): (name: string) => boolean {
  if (extensions === undefined) return () => true
  const allowed = new Set(extensions.split(',').map(ext => ext.trim().replace(/^\./, '').toLowerCase()).filter(Boolean))
  return name => allowed.has(name.match(/\.([^.\/]+)$/)?.[1]?.toLowerCase() || '')
}
