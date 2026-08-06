import {mediaNameLooksLikePath, parseMediaFilePath} from '../../shared/mediaPath'

export type BulkPathUpdateInput = {
  id: number
  path: string
}

export type BulkPathUpdatePatch = {
  id: number
  path: string
  basename: string
  name: string
  ext: string
}

/** Preserve custom titles when only the directory changes; repair path-like names. */
export function buildBulkPathUpdatePatch(
  input: BulkPathUpdateInput,
  existing: {path?: string | null; name?: string | null} | null | undefined,
): BulkPathUpdatePatch {
  const parsed = parseMediaFilePath(input.path)
  const oldStem = existing?.path ? parseMediaFilePath(existing.path).name : ''
  const stemUnchanged = Boolean(oldStem) && oldStem === parsed.name
  const existingName = existing?.name != null ? String(existing.name) : ''

  const name = stemUnchanged
    && existingName
    && !mediaNameLooksLikePath(existingName)
    ? existingName
    : parsed.name

  return {
    id: input.id,
    path: input.path,
    basename: parsed.basename,
    name,
    ext: parsed.ext,
  }
}

export function normalizeBulkPathUpdateInputs(
  mediaFiles: Array<{id?: unknown; path?: unknown}>,
): BulkPathUpdateInput[] {
  const updates: BulkPathUpdateInput[] = []
  for (const item of mediaFiles) {
    const id = Number(item.id)
    const filePath = String(item.path ?? '')
    if (!id || !filePath) continue
    updates.push({id, path: filePath})
  }
  return updates
}
