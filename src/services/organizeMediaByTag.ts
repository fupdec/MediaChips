import path from 'path-browserify'

const STORAGE_KEY = 'mediachips.organizeByTag.prefs'

export type OrganizeByTagPrefs = {
  root: string
  metaIds: number[]
}

export type OrganizeMoveItem = {
  id: number
  folder: string
}

type MediaLike = {
  id?: number
  path?: string
  tags?: Array<{metaId?: number; tagId?: number}>
}

type TagLike = {
  id?: number
  name?: string
}

export function loadOrganizeByTagPrefs(): OrganizeByTagPrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OrganizeByTagPrefs>
    const root = String(parsed.root || '').trim()
    const metaIds = Array.isArray(parsed.metaIds)
      ? parsed.metaIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
      : []
    if (!root || !metaIds.length) return null
    return {root, metaIds}
  } catch {
    return null
  }
}

export function saveOrganizeByTagPrefs(prefs: OrganizeByTagPrefs): void {
  const root = String(prefs.root || '').trim()
  const metaIds = [...new Set(
    (prefs.metaIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0),
  )]
  if (!root || !metaIds.length) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify({root, metaIds}))
}

export function hasOrganizeByTagPrefs(prefs: OrganizeByTagPrefs | null | undefined): boolean {
  return Boolean(prefs?.root?.trim() && prefs.metaIds?.length)
}

/**
 * Build move targets: root / tagName(meta1) / tagName(meta2) / …
 * Skips meta levels when the media has no matching tag.
 */
export function buildOrganizeMoveItems(options: {
  ids: number[]
  root: string
  metaIds: number[]
  mediaById: Map<number, MediaLike>
  tagsById: Map<number, TagLike>
}): OrganizeMoveItem[] {
  const root = String(options.root || '').trim()
  if (!root || !options.metaIds.length) return []

  const moveItems: OrganizeMoveItem[] = []
  for (const id of options.ids) {
    const mediaId = Number(id)
    if (!Number.isFinite(mediaId) || mediaId <= 0) continue
    const item = options.mediaById.get(mediaId)
    if (!item) continue

    const itemTags = (item.tags || []) as Array<{metaId?: number; tagId?: number}>
    let folder = root
    for (const metaId of options.metaIds) {
      const link = itemTags.find((row) => Number(row.metaId) === Number(metaId))
      if (!link?.tagId) continue
      const tag = options.tagsById.get(Number(link.tagId))
      const name = String(tag?.name || '').trim()
      if (!name) continue
      folder = path.join(folder, name)
    }
    moveItems.push({id: mediaId, folder})
  }
  return moveItems
}
