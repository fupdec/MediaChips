import type {WatcherFilesEntry} from '@/types/watcher'
import {getWatcherBadgeCounts} from '@/utils/watcherBadgeUtils'

export type MediaInboxNewItem = {
  key: string
  path: string
  folderId: number
  folderName: string
  folderPath?: string
  mediaTypeId: number
  mediaTypeIcon?: string
  mediaTypeName?: string
}

export type MediaInboxLostItem = {
  key: string
  id: number
  path: string
  folderId: number
  folderName: string
  folderPath?: string
  mediaTypeId: number
  mediaTypeIcon?: string
  mediaTypeName?: string
}

export type MediaInboxNewGroup = {
  key: string
  folderId: number
  folderName: string
  folderPath?: string
  mediaTypeId: number
  mediaTypeIcon?: string
  mediaTypeName?: string
  items: MediaInboxNewItem[]
}

function normalizeInboxPath(filePath: string): string {
  return String(filePath || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function normalizeMediaInboxPath(filePath: string): string {
  return normalizeInboxPath(filePath)
}

/** Flatten watcher "new" paths into a stable inbox list (newest folders first as given). */
export function collectMediaInboxNewItems(
  entries: WatcherFilesEntry[] = [],
  ignoredPaths: string[] = [],
): MediaInboxNewItem[] {
  const ignored = new Set(ignoredPaths.map(normalizeInboxPath).filter(Boolean))
  const items: MediaInboxNewItem[] = []

  for (const entry of entries) {
    const folderId = Number(entry.folder?.id)
    if (!Number.isFinite(folderId) || folderId <= 0) continue
    const folderName = String(entry.folder?.name || entry.folder?.path || folderId)
    const folderPath = entry.folder?.path ? String(entry.folder.path) : undefined

    for (const group of entry.files || []) {
      const mediaTypeId = Number(group.type?.id)
      if (!Number.isFinite(mediaTypeId) || mediaTypeId <= 0) continue
      const mediaTypeIcon = group.type?.icon ? String(group.type.icon) : undefined
      const mediaTypeName = group.type?.name ? String(group.type.name) : undefined

      for (const filePath of group.new || []) {
        const path = String(filePath || '').trim()
        if (!path) continue
        if (ignored.has(normalizeInboxPath(path))) continue
        items.push({
          key: `${folderId}:${mediaTypeId}:${normalizeInboxPath(path)}`,
          path,
          folderId,
          folderName,
          folderPath,
          mediaTypeId,
          mediaTypeIcon,
          mediaTypeName,
        })
      }
    }
  }

  return items
}

export function collectMediaInboxLostItems(
  entries: WatcherFilesEntry[] = [],
): MediaInboxLostItem[] {
  const items: MediaInboxLostItem[] = []

  for (const entry of entries) {
    const folderId = Number(entry.folder?.id)
    if (!Number.isFinite(folderId) || folderId <= 0) continue
    const folderName = String(entry.folder?.name || entry.folder?.path || folderId)
    const folderPath = entry.folder?.path ? String(entry.folder.path) : undefined

    for (const group of entry.files || []) {
      const mediaTypeId = Number(group.type?.id)
      if (!Number.isFinite(mediaTypeId) || mediaTypeId <= 0) continue
      const mediaTypeIcon = group.type?.icon ? String(group.type.icon) : undefined
      const mediaTypeName = group.type?.name ? String(group.type.name) : undefined

      for (const lost of group.lost || []) {
        const id = Number(lost?.id)
        const path = String(lost?.path || '').trim()
        if (!Number.isFinite(id) || id <= 0 || !path) continue
        items.push({
          key: `${folderId}:${mediaTypeId}:${id}`,
          id,
          path,
          folderId,
          folderName,
          folderPath,
          mediaTypeId,
          mediaTypeIcon,
          mediaTypeName,
        })
      }
    }
  }

  return items
}

/** Group new inbox items by folder + media type for bulk add actions. */
export function groupMediaInboxNewItems(items: MediaInboxNewItem[]): MediaInboxNewGroup[] {
  const groups = new Map<string, MediaInboxNewGroup>()

  for (const item of items) {
    const key = `${item.folderId}:${item.mediaTypeId}`
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        folderId: item.folderId,
        folderName: item.folderName,
        folderPath: item.folderPath,
        mediaTypeId: item.mediaTypeId,
        mediaTypeIcon: item.mediaTypeIcon,
        mediaTypeName: item.mediaTypeName,
        items: [],
      }
      groups.set(key, group)
    }
    group.items.push(item)
  }

  return [...groups.values()]
}

export function countMediaInboxNew(
  entries: WatcherFilesEntry[] = [],
  ignoredPaths: string[] = [],
): number {
  return collectMediaInboxNewItems(entries, ignoredPaths).length
}

export function countMediaInboxLost(entries: WatcherFilesEntry[] = []): number {
  let total = 0
  for (const entry of entries) {
    total += getWatcherBadgeCounts(entry.files).lost
  }
  return total
}

export function basenameFromInboxPath(filePath: string): string {
  const normalized = String(filePath || '').replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || normalized
}
