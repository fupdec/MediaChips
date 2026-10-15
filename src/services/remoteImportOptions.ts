import {normalizePastedFilePathsText} from '@/utils/filePathInput'

export type RemoteImportOptions = {
  parseTags: boolean
  excludePaths: boolean
  excluded: string
}

export const defaultRemoteImportOptions = (): RemoteImportOptions => ({
  parseTags: true, excludePaths: false, excluded: '',
})

/** Match path fragments as in the local media file walker. */
export function remotePathExcluder(options: RemoteImportOptions): (path: string) => boolean {
  const excluded = options.excludePaths
    ? String(normalizePastedFilePathsText(options.excluded) || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    : []
  return path => excluded.some(fragment => path.includes(fragment))
}
