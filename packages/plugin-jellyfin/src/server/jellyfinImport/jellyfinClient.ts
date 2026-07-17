import {
  normalizeJellyfinBaseUrl,
  ticksToSeconds,
} from './mapEntities'
import type {
  JellyfinChapter,
  JellyfinGenre,
  JellyfinLibraryInfo,
  JellyfinLibrarySnapshot,
  JellyfinMediaItem,
  JellyfinPerson,
  JellyfinSeries,
  JellyfinStudio,
} from './types'

const PAGE_SIZE = 200

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

export interface JellyfinClient {
  listLibraries: () => Promise<JellyfinLibraryInfo[]>
  loadLibrarySnapshot: (libraryIds?: string[]) => Promise<JellyfinLibrarySnapshot>
}

export function createJellyfinClient(options: {
  baseUrl: string
  apiKey: string
  fetchImpl?: typeof fetch
}): JellyfinClient {
  const baseUrl = normalizeJellyfinBaseUrl(options.baseUrl)
  const apiKey = String(options.apiKey || '').trim()
  const fetchImpl = options.fetchImpl ?? fetch

  if (!baseUrl) {
    throw new Error('Jellyfin server URL is required')
  }
  if (!apiKey) {
    throw new Error('Jellyfin API key is required')
  }

  async function request(pathname: string, query: Record<string, string | number | undefined> = {}) {
    const url = new URL(pathname.replace(/^\//, ''), `${baseUrl}/`)
    for (const [key, value] of Object.entries(query)) {
      if (value == null || value === '') continue
      url.searchParams.set(key, String(value))
    }

    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Emby-Token': apiKey,
        Authorization: `MediaBrowser Token="${apiKey}"`,
      },
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `Jellyfin request failed (${response.status} ${response.statusText})${body ? `: ${body.slice(0, 200)}` : ''}`,
      )
    }

    return response.json() as Promise<unknown>
  }

  async function fetchAllItems(query: Record<string, string | number | undefined>): Promise<JsonRecord[]> {
    const items: JsonRecord[] = []
    let startIndex = 0

    while (true) {
      const payload = asRecord(await request('/Items', {
        ...query,
        Recursive: 'true',
        StartIndex: startIndex,
        Limit: PAGE_SIZE,
        EnableTotalRecordCount: 'true',
      }))
      const page = asArray(payload?.Items).map(asRecord).filter(Boolean) as JsonRecord[]
      items.push(...page)
      const total = Number(payload?.TotalRecordCount)
      startIndex += page.length
      if (!page.length || (Number.isFinite(total) && startIndex >= total) || page.length < PAGE_SIZE) {
        break
      }
    }

    return items
  }

  async function listLibraries(): Promise<JellyfinLibraryInfo[]> {
    const payload = await request('/Library/VirtualFolders')
    const folders = asArray(payload)
    return folders.map((entry) => {
      const row = asRecord(entry) || {}
      return {
        id: asString(row.ItemId) || asString(row.Guid) || asString(row.Name) || '',
        name: asString(row.Name) || 'Library',
        collectionType: asString(row.CollectionType),
      }
    }).filter((lib) => lib.id)
  }

  function parseChapter(raw: unknown): JellyfinChapter | null {
    const row = asRecord(raw)
    if (!row) return null
    const startSeconds = ticksToSeconds(Number(row.StartPositionTicks))
    if (startSeconds == null) return null
    return {
      name: asString(row.Name),
      startSeconds,
    }
  }

  function parseMediaItem(raw: JsonRecord): JellyfinMediaItem | null {
    const id = asString(raw.Id)
    if (!id) return null

    const mediaSources = asArray(raw.MediaSources).map(asRecord).filter(Boolean) as JsonRecord[]
    const primarySource = mediaSources[0] || null
    const path = asString(raw.Path) || asString(primarySource?.Path)

    const streams = asArray(primarySource?.MediaStreams || raw.MediaStreams)
      .map(asRecord)
      .filter(Boolean) as JsonRecord[]
    const videoStream = streams.find((stream) => asString(stream.Type) === 'Video') || null

    const people = asArray(raw.People).map(asRecord).filter(Boolean) as JsonRecord[]
    const personIds = people
      .filter((person) => {
        const type = (asString(person.Type) || '').toLowerCase()
        return !type || type === 'actor' || type === 'gueststar'
      })
      .map((person) => asString(person.Id))
      .filter(Boolean) as string[]

    const genreItems = asArray(raw.GenreItems).map(asRecord).filter(Boolean) as JsonRecord[]
    let genreIds = genreItems
      .map((genre) => asString(genre.Id))
      .filter(Boolean) as string[]
    if (!genreIds.length) {
      genreIds = asArray(raw.Genres)
        .map((name) => asString(name))
        .filter(Boolean)
        .map((name) => `name:${name}`) as string[]
    }

    const studios = asArray(raw.Studios).map(asRecord).filter(Boolean) as JsonRecord[]
    const studioIds = studios
      .map((studio) => asString(studio.Id))
      .filter(Boolean) as string[]

    const userData = asRecord(raw.UserData)

    return {
      id,
      name: asString(raw.Name) || id,
      path,
      type: asString(raw.Type) || 'Movie',
      seriesId: asString(raw.SeriesId),
      filesize: primarySource?.Size != null ? Number(primarySource.Size) : null,
      duration: ticksToSeconds(
        Number(raw.RunTimeTicks ?? primarySource?.RunTimeTicks),
      ),
      width: videoStream?.Width != null
        ? Number(videoStream.Width)
        : (raw.Width != null ? Number(raw.Width) : null),
      height: videoStream?.Height != null
        ? Number(videoStream.Height)
        : (raw.Height != null ? Number(raw.Height) : null),
      bitrate: primarySource?.Bitrate != null
        ? Number(primarySource.Bitrate)
        : (raw.Bitrate != null ? Number(raw.Bitrate) : null),
      codec: asString(videoStream?.Codec),
      communityRating: raw.CommunityRating != null ? Number(raw.CommunityRating) : null,
      playCount: Number(userData?.PlayCount) || 0,
      lastPlayedDate: asString(userData?.LastPlayedDate),
      personIds: [...new Set(personIds)],
      genreIds: [...new Set(genreIds)],
      studioIds: [...new Set(studioIds)],
      chapters: asArray(raw.Chapters).map(parseChapter).filter(Boolean) as JellyfinChapter[],
    }
  }

  async function loadLibrarySnapshot(libraryIds?: string[]): Promise<JellyfinLibrarySnapshot> {
    const selectedIds = (libraryIds || []).map((id) => String(id).trim()).filter(Boolean)
    const libraries = selectedIds.length
      ? selectedIds.map((id) => ({id, name: id}))
      : await listLibraries()

    const peopleById = new Map<string, JellyfinPerson>()
    const genresById = new Map<string, JellyfinGenre>()
    const studiosById = new Map<string, JellyfinStudio>()
    const seriesById = new Map<string, JellyfinSeries>()
    const items: JellyfinMediaItem[] = []

    const itemFields = [
      'Path',
      'MediaSources',
      'MediaStreams',
      'Genres',
      'GenreItems',
      'People',
      'Studios',
      'ProviderIds',
      'CommunityRating',
      'RunTimeTicks',
      'Width',
      'Height',
      'Bitrate',
      'Chapters',
      'SeriesId',
      'SeriesName',
      'UserData',
    ].join(',')

    for (const library of libraries) {
      const rawItems = await fetchAllItems({
        ParentId: library.id,
        IncludeItemTypes: 'Movie,Episode',
        Fields: itemFields,
      })

      for (const raw of rawItems) {
        const people = asArray(raw.People).map(asRecord).filter(Boolean) as JsonRecord[]
        for (const person of people) {
          const type = (asString(person.Type) || '').toLowerCase()
          if (type && type !== 'actor' && type !== 'gueststar') continue
          const id = asString(person.Id)
          const name = asString(person.Name)
          if (!id || !name || peopleById.has(id)) continue
          peopleById.set(id, {id, name})
        }

        const genreItems = asArray(raw.GenreItems).map(asRecord).filter(Boolean) as JsonRecord[]
        if (genreItems.length) {
          for (const genre of genreItems) {
            const id = asString(genre.Id)
            const name = asString(genre.Name)
            if (!id || !name || genresById.has(id)) continue
            genresById.set(id, {id, name})
          }
        } else {
          for (const genreName of asArray(raw.Genres)) {
            const name = asString(genreName)
            if (!name) continue
            const id = `name:${name}`
            if (!genresById.has(id)) genresById.set(id, {id, name})
          }
        }

        for (const studio of asArray(raw.Studios).map(asRecord).filter(Boolean) as JsonRecord[]) {
          const id = asString(studio.Id)
          const name = asString(studio.Name)
          if (!id || !name || studiosById.has(id)) continue
          studiosById.set(id, {id, name})
        }

        const seriesId = asString(raw.SeriesId)
        const seriesName = asString(raw.SeriesName)
        if (seriesId && seriesName && !seriesById.has(seriesId)) {
          seriesById.set(seriesId, {id: seriesId, name: seriesName})
        }

        const item = parseMediaItem(raw)
        if (item) items.push(item)
      }

      const seriesItems = await fetchAllItems({
        ParentId: library.id,
        IncludeItemTypes: 'Series',
        Fields: 'ProviderIds',
      })
      for (const raw of seriesItems) {
        const id = asString(raw.Id)
        const name = asString(raw.Name)
        if (!id || !name || seriesById.has(id)) continue
        seriesById.set(id, {id, name})
      }
    }

    return {
      people: [...peopleById.values()],
      genres: [...genresById.values()],
      studios: [...studiosById.values()],
      series: [...seriesById.values()],
      items,
    }
  }

  return {
    listLibraries,
    loadLibrarySnapshot,
  }
}
