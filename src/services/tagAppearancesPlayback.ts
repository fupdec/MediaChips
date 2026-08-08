import type {FaceAppearanceItem, FaceAppearancesResponse} from '@shared/api/responses'

export type FetchFaceAppearancesPage = (body: {
  tagId: number
  sort?: 'time' | 'shuffle'
  limit?: number
  offset?: number
}) => Promise<Pick<FaceAppearancesResponse, 'items' | 'count'>>

export type TagAppearancesPlaybackLoad = {
  empty: boolean
  count: number
  first: FaceAppearanceItem | null
  playlist: FaceAppearanceItem[]
}

/**
 * Lazy-start face appearance playback: fetch the first hit, then the remainder
 * with offset so the playlist fill does not re-query the head.
 */
export async function loadTagAppearancesForPlayback(
  fetchAppearances: FetchFaceAppearancesPage,
  tagId: number,
  sort: 'time' | 'shuffle' = 'time',
): Promise<TagAppearancesPlaybackLoad> {
  const resolvedSort = sort === 'shuffle' ? 'shuffle' : 'time'
  const firstPage = await fetchAppearances({
    tagId,
    sort: resolvedSort,
    limit: 1,
  })
  const firstItems = firstPage.items || []
  const count = Number(firstPage.count ?? firstItems.length)

  if (!firstItems.length) {
    return {empty: true, count: 0, first: null, playlist: []}
  }

  if (count <= 1) {
    return {
      empty: false,
      count,
      first: firstItems[0],
      playlist: firstItems,
    }
  }

  const restPage = await fetchAppearances({
    tagId,
    sort: resolvedSort,
    offset: 1,
  })
  const restItems = restPage.items || []

  return {
    empty: false,
    count: Number(restPage.count ?? count),
    first: firstItems[0],
    playlist: [...firstItems, ...restItems],
  }
}
