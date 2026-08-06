import type { ApiDb } from '../types/db'
import type { ParsedDynamicPlaylistSummary } from '@shared/schemas/filters'
import { queryAll } from '../db/utils/rawQuery'
import { createPlaylistsRepository } from '../db/repositories/playlists'

/** Slim card payload: count + up to 4 preview ids (no media/metadata join). */
async function getManualPlaylistsSummary(db: ApiDb): Promise<ParsedDynamicPlaylistSummary[]> {
  const playlistsRepo = createPlaylistsRepository(db.drizzle)
  const playlists = playlistsRepo.findAll()

  if (!playlists.length) return []

  const counts = queryAll<{playlistId: number; count: number}>(db, `
    SELECT playlistId, COUNT(*) AS count
    FROM mediaInPlaylists
    GROUP BY playlistId
  `)
  const countById = new Map(
    counts.map((row) => [Number(row.playlistId), Number(row.count) || 0]),
  )

  const previewRows = queryAll<{playlistId: number; mediaId: number}>(db, `
    SELECT playlistId, mediaId
    FROM (
      SELECT
        playlistId,
        mediaId,
        ROW_NUMBER() OVER (
          PARTITION BY playlistId
          ORDER BY \`order\` ASC, mediaId ASC
        ) AS rn
      FROM mediaInPlaylists
    )
    WHERE rn <= 4
    ORDER BY playlistId ASC, rn ASC
  `)

  const previewById = new Map<number, number[]>()
  for (const row of previewRows) {
    const playlistId = Number(row.playlistId)
    const list = previewById.get(playlistId) || []
    list.push(Number(row.mediaId))
    previewById.set(playlistId, list)
  }

  return playlists.map((playlist) => ({
    id: Number(playlist.id),
    name: playlist.name ?? '',
    count: countById.get(Number(playlist.id)) || 0,
    previewIds: previewById.get(Number(playlist.id)) || [],
  }))
}

export { getManualPlaylistsSummary }
