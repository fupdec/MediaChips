export type RelinkStatus = 'same' | 'unknown' | 'different' | 'missing' | 'conflict'

export interface MediaRelinkInput {
  id: number
  oldPath: string
  newPath: string
  confirmedOriginal?: boolean
}

export interface MediaRelinkCandidate extends MediaRelinkInput {
  status: RelinkStatus
}

/** Replace a directory prefix, never a substring or a sibling's prefix. */
export function remapMediaRoot(filePath: string, oldRoot: string, newRoot: string): string | null {
  const normalize = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '')
  const source = normalize(filePath)
  const root = normalize(oldRoot)
  const destination = normalize(newRoot)
  const windowsPath = /^[a-z]:\//i.test(root) || root.startsWith('//')
  const comparableSource = windowsPath ? source.toLowerCase() : source
  const comparableRoot = windowsPath ? root.toLowerCase() : root
  if (!oldRoot.trim() || !newRoot.trim() || !comparableSource.startsWith(comparableRoot + '/')) return null
  const remapped = destination + source.slice(root.length)
  return newRoot.includes('\\') ? remapped.replace(/\//g, '\\') : remapped
}
