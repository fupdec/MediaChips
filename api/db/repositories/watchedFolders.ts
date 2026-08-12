import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { mediaTypesInWatchedFolders, watchedFolders } from '../schema/watchedFolders'
import { nowIso } from '../utils/timestamps'
import {
  normalizeExcludedPaths,
  parseExcludedPathsJson,
  serializeExcludedPaths,
} from '../../utils/watchedFolderExcludes'
import { normalizeMediaPath } from '../../utils/normalizeUserPath'

export type WatchedFolderRow = typeof watchedFolders.$inferSelect

export type WatchedFolderPublic = Omit<WatchedFolderRow, 'excludedPaths'> & {
  excludedPaths: string[]
}

export type WatchedFolderUpsertInput = {
  path: string
  name?: string | null
  icon?: string | null
  excludedPaths?: string[] | null
  watch?: boolean
}
function normalizeIcon(icon: unknown): string | null {
  if (typeof icon !== 'string') return null
  const trimmed = icon.trim().replace(/^mdi-/, '')
  return trimmed || null
}

export function toPublicWatchedFolder(row: WatchedFolderRow): WatchedFolderPublic {
  return {
    ...row,
    excludedPaths: parseExcludedPathsJson(row.excludedPaths),
  }
}

function buildExcludedPathsColumn(rootPath: string, paths: unknown): string | null {
  return serializeExcludedPaths(normalizeExcludedPaths(rootPath, paths))
}

export function createWatchedFoldersRepository(db: DrizzleClient) {
  return {
    findOrCreateByPath(
      path: string,
      name: string | null | undefined,
      extras: {icon?: string | null; excludedPaths?: string[] | null} = {},
    ): {folder: WatchedFolderRow; created: boolean} {
      const existing = db.select().from(watchedFolders).where(eq(watchedFolders.path, path)).get()
      if (existing) {
        return {folder: existing, created: false}
      }

      const timestamp = nowIso()
      const folder = db.insert(watchedFolders)
        .values({
          path,
          name: name ?? null,
          watch: true,
          icon: normalizeIcon(extras.icon),
          excludedPaths: buildExcludedPathsColumn(path, extras.excludedPaths),
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning()
        .get()

      return {folder, created: true}
    },

    updateById(id: number, data: Record<string, unknown>): void {
      const patch: Partial<typeof watchedFolders.$inferInsert> = {}

      if (typeof data.path === 'string' && data.path.trim()) {
        patch.path = normalizeMediaPath(data.path.trim())
      }
      if (Object.prototype.hasOwnProperty.call(data, 'name')) {
        patch.name = data.name == null ? null : String(data.name)
      }
      if (typeof data.watch === 'boolean') {
        patch.watch = data.watch
      }
      if (Object.prototype.hasOwnProperty.call(data, 'icon')) {
        patch.icon = normalizeIcon(data.icon)
      }

      const nextPath = patch.path
        ?? db.select({path: watchedFolders.path}).from(watchedFolders).where(eq(watchedFolders.id, id)).get()?.path
        ?? ''

      if (Object.prototype.hasOwnProperty.call(data, 'excludedPaths')) {
        patch.excludedPaths = buildExcludedPathsColumn(String(nextPath), data.excludedPaths)
      }

      if (!Object.keys(patch).length) {
        return
      }

      db.update(watchedFolders)
        .set({
          ...patch,
          updatedAt: nowIso(),
        })
        .where(eq(watchedFolders.id, id))
        .run()
    },

    deleteById(id: number): void {
      db.delete(watchedFolders).where(eq(watchedFolders.id, id)).run()
    },

    replaceMediaTypes(folderId: number, mediaTypeIds: number[]): void {
      db.delete(mediaTypesInWatchedFolders)
        .where(eq(mediaTypesInWatchedFolders.folderId, folderId))
        .run()

      for (const mediaTypeId of mediaTypeIds) {
        db.insert(mediaTypesInWatchedFolders)
          .values({folderId, mediaTypeId})
          .onConflictDoNothing()
          .run()
      }
    },

    upsertFolderWithTypes(
      folder: WatchedFolderUpsertInput,
      mediaTypeIds: number[],
    ): WatchedFolderRow {
      return db.transaction((tx) => {
        const repo = createWatchedFoldersRepository(tx)
        const path = normalizeMediaPath(folder.path)
        const {folder: folderRow, created} = repo.findOrCreateByPath(path, folder.name, {
          icon: folder.icon,
          excludedPaths: folder.excludedPaths,
        })

        const patch: Record<string, unknown> = {}
        if (!created) {
          if (folder.name != null) patch.name = folder.name
          if (Object.prototype.hasOwnProperty.call(folder, 'icon')) patch.icon = folder.icon
          if (Object.prototype.hasOwnProperty.call(folder, 'excludedPaths')) {
            patch.excludedPaths = folder.excludedPaths
          }
          if (typeof folder.watch === 'boolean') patch.watch = folder.watch
          if (Object.keys(patch).length) {
            repo.updateById(folderRow.id, patch)
          }
        }

        repo.replaceMediaTypes(folderRow.id, mediaTypeIds)

        return tx.select().from(watchedFolders).where(eq(watchedFolders.id, folderRow.id)).get()!
      })
    },
  }
}
