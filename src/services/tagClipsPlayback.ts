import type {MarkClipItem, MarkClipsResponse} from '@shared/api/responses'

export type FetchMarkClipsPage = (body: {
  tagId: number
  sort?: 'time' | 'shuffle'
  limit?: number
  offset?: number
}) => Promise<Pick<MarkClipsResponse, 'items' | 'count'>>

export type TagClipsPlaybackLoad = {
  empty: boolean
  count: number
  first: MarkClipItem | null
  playlist: MarkClipItem[]
}

/**
 * Lazy-start clip playback: fetch the first ranged mark, then the remainder
 * with offset (skipping the already-loaded head) so the playlist fill does
 * not re-query the first row.
 */
export async function loadTagClipsForPlayback(
  fetchClips: FetchMarkClipsPage,
  tagId: number,
): Promise<TagClipsPlaybackLoad> {
  const firstPage = await fetchClips({
    tagId,
    sort: 'time',
    limit: 1,
  })
  const firstClips = firstPage.items || []
  const count = Number(firstPage.count ?? firstClips.length)

  if (!firstClips.length) {
    return {empty: true, count: 0, first: null, playlist: []}
  }

  if (count <= 1) {
    return {
      empty: false,
      count,
      first: firstClips[0],
      playlist: firstClips,
    }
  }

  const restPage = await fetchClips({
    tagId,
    sort: 'time',
    offset: 1,
  })
  const restClips = restPage.items || []

  return {
    empty: false,
    count: Number(restPage.count ?? count),
    first: firstClips[0],
    playlist: [...firstClips, ...restClips],
  }
}
