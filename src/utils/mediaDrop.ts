import { normalizePastedFilePath } from '@/utils/filePathInput'
import type { EventBusEvent, EventBusMap } from '@shared/events/map'
import type { MediaType } from '@/types/media'
import { inferMediaTypeFromPaths, parseMediaTypeExtensions } from '@/utils/mediaType'
import { isLikelyExternalFileDrag } from '@shared/mediaFileDrag'

interface EventBusLike {
  emit: <K extends EventBusEvent>(event: K, payload?: EventBusMap[K]) => void
}

function getDroppedFilePath(file: File & { path?: string }): string {
  if (!file) return ''

  const fromElectron = window.electronAPI?.getPathForFile?.(file)
  if (fromElectron) return String(normalizePastedFilePath(fromElectron))

  return String(normalizePastedFilePath(file.path || ''))
}

function getDroppedFilesFromEvent(event: DragEvent | null | undefined): File[] {
  const files: File[] = []
  const seen = new Set<File>()

  for (const file of Array.from(event?.dataTransfer?.files || [])) {
    if (!file || seen.has(file)) continue
    seen.add(file)
    files.push(file)
  }

  if (!files.length) {
    for (const item of Array.from(event?.dataTransfer?.items || [])) {
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (!file || seen.has(file)) continue
      seen.add(file)
      files.push(file)
    }
  }

  return files
}

function collapseNestedDroppedPaths(paths: string[]): string[] {
  const normalized = [...new Set(paths.filter(Boolean))]
  if (normalized.length <= 1) return normalized

  const isNestedIn = (path: string, parent: string): boolean => {
    if (path === parent) return false
    const prefix = parent.endsWith('\\') || parent.endsWith('/') ? parent : `${parent}\\`
    const altPrefix = `${parent}/`
    return path.startsWith(prefix) || path.startsWith(altPrefix)
  }

  const roots = normalized.filter((path) =>
    !normalized.some((other) => isNestedIn(path, other)),
  )

  return roots.length ? roots : normalized
}

export function containsDroppedFiles(event: DragEvent | null | undefined): boolean {
  return isLikelyExternalFileDrag(event)
}

export function collectDroppedPaths(event: DragEvent | null | undefined): string[] {
  const paths = getDroppedFilesFromEvent(event)
    .map((file) => getDroppedFilePath(file))
    .filter(Boolean)

  return collapseNestedDroppedPaths(paths)
}

function looksLikeFilePath(path: string, mediaTypes?: MediaType[] | null): boolean {
  const basename = path.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || ''
  const extension = basename.includes('.') ? basename.split('.').pop()?.toLowerCase() : ''
  if (!extension) return false

  if (mediaTypes?.length) {
    for (const mediaType of mediaTypes) {
      if (parseMediaTypeExtensions(mediaType.extensions).includes(extension)) {
        return true
      }
    }
  }

  return /\.[^./\\]+$/.test(path)
}

export function partitionDroppedPaths(
  paths: string[],
  mediaTypes?: MediaType[] | null,
): { files: string[]; directories: string[] } {
  const files: string[] = []
  const directories: string[] = []

  for (const entryPath of paths) {
    if (looksLikeFilePath(entryPath, mediaTypes)) {
      files.push(entryPath)
    } else {
      directories.push(entryPath)
    }
  }

  return { files, directories }
}

interface MediaAddingStore {
  mediaAdding: {
    media_type_id: number | null
    directFiles: unknown[]
    skipFileScan: boolean
    paths: string
    dialogProcess: boolean
    active: boolean
  }
}

export function startDroppedMediaAdding({
  paths,
  mediaTypeId,
  mediaTypes,
  tasksStore,
  eventBus,
}: {
  paths: string[]
  mediaTypeId?: number | string | null
  mediaTypes?: MediaType[] | null
  tasksStore: MediaAddingStore
  eventBus: EventBusLike
}): boolean {
  if (!paths.length) return false

  const { files, directories } = partitionDroppedPaths(paths, mediaTypes)
  const pathsForTypeInference = files.length ? files : paths

  const resolvedMediaTypeId = Number(
    mediaTypeId
    ?? inferMediaTypeFromPaths(pathsForTypeInference, mediaTypes)?.id,
  )

  if (!resolvedMediaTypeId) return false

  const isDirectFilesOnly = files.length > 0 && directories.length === 0

  tasksStore.mediaAdding.media_type_id = resolvedMediaTypeId
  tasksStore.mediaAdding.directFiles = isDirectFilesOnly ? [...files] : files
  tasksStore.mediaAdding.skipFileScan = isDirectFilesOnly
  // File-only drops leave paths empty so AddingMedia uses directFiles without scanning.
  tasksStore.mediaAdding.paths = directories.length
    ? directories.join('\n')
    : (isDirectFilesOnly ? '' : files.join('\n'))
  tasksStore.mediaAdding.dialogProcess = true
  tasksStore.mediaAdding.active = true
  eventBus.emit('addMedia')

  return true
}
