import {msToSeconds, normalizePlexBaseUrl} from './mapEntities'
import type {
  PlexChapter,
  PlexLibraryInfo,
  PlexLibrarySnapshot,
  PlexMediaItem,
  PlexNamedEntity,
} from './types'

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
function text(value: unknown): string | null {
  const result = value == null ? '' : String(value).trim()
  return result || null
}

export interface PlexClient {
  listLibraries(): Promise<PlexLibraryInfo[]>
  loadLibrarySnapshot(libraryIds?: string[]): Promise<PlexLibrarySnapshot>
}

export function createPlexClient(options: {
  baseUrl: string
  token: string
  fetchImpl?: typeof fetch
}): PlexClient {
  const baseUrl = normalizePlexBaseUrl(options.baseUrl)
  const token = String(options.token || '').trim()
  const fetchImpl = options.fetchImpl ?? fetch
  if (!baseUrl) throw new Error('Plex server URL is required')
  if (!token) throw new Error('Plex token is required')

  async function request(pathname: string): Promise<JsonRecord> {
    const response = await fetchImpl(new URL(pathname.replace(/^\//, ''), `${baseUrl}/`).toString(), {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': 'mediachips-import',
        'X-Plex-Product': 'MediaChips',
        'X-Plex-Version': '1.0',
      },
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Plex request failed (${response.status} ${response.statusText})${body ? `: ${body.slice(0, 200)}` : ''}`)
    }
    return (await response.json()) as JsonRecord
  }

  async function listLibraries(): Promise<PlexLibraryInfo[]> {
    const payload = await request('/library/sections')
    return array(record(payload.MediaContainer)?.Directory).map(record).filter(Boolean).map((row) => ({
      id: text(row!.key) || '',
      name: text(row!.title) || 'Library',
      type: text(row!.type),
    })).filter((library) => library.id)
  }

  function parseItem(raw: JsonRecord): PlexMediaItem | null {
    const id = text(raw.ratingKey)
    if (!id) return null
    const media = record(array(raw.Media)[0])
    const part = record(array(media?.Part)[0])
    const genres = array(raw.Genre).map(record).filter(Boolean) as JsonRecord[]
    const people = array(raw.Role).map(record).filter(Boolean) as JsonRecord[]
    const studio = text(raw.studio)
    const chapters = array(raw.Chapter).map(record).filter(Boolean).map((chapter): PlexChapter | null => {
      const startSeconds = msToSeconds(Number(chapter!.startTimeOffset))
      return startSeconds == null ? null : {name: text(chapter!.tag), startSeconds}
    }).filter(Boolean) as PlexChapter[]
    const seriesId = text(raw.grandparentRatingKey)
    return {
      id,
      name: text(raw.titleSort) || text(raw.title) || id,
      path: text(part?.file),
      type: text(raw.type) || 'movie',
      seriesId,
      filesize: media?.size == null ? null : Number(media.size),
      duration: msToSeconds(Number(raw.duration)),
      width: media?.videoResolution == null ? null : Number(media.videoResolution),
      height: null,
      bitrate: media?.bitrate == null ? null : Number(media.bitrate),
      codec: text(media?.videoCodec),
      rating: raw.rating == null ? null : Number(raw.rating),
      playCount: Number(raw.viewCount) || 0,
      lastPlayedDate: raw.lastViewedAt == null ? null : new Date(Number(raw.lastViewedAt) * 1000).toISOString(),
      personIds: people.map((person) => text(person.id) || `name:${text(person.tag) || ''}`).filter((id) => id !== 'name:'),
      genreIds: genres.map((genre) => text(genre.id) || `name:${text(genre.tag) || ''}`).filter((id) => id !== 'name:'),
      studioIds: studio ? [`name:${studio}`] : [],
      chapters,
    }
  }

  async function loadLibrarySnapshot(libraryIds?: string[]): Promise<PlexLibrarySnapshot> {
    const libraries = await listLibraries()
    const selected = (libraryIds?.length ? libraries.filter((library) => libraryIds.includes(library.id)) : libraries)
    const people = new Map<string, PlexNamedEntity>()
    const genres = new Map<string, PlexNamedEntity>()
    const studios = new Map<string, PlexNamedEntity>()
    const series = new Map<string, PlexNamedEntity>()
    const items: PlexMediaItem[] = []
    const collect = (entities: JsonRecord[], target: Map<string, PlexNamedEntity>) => {
      for (const entity of entities) {
        const name = text(entity.tag)
        const id = text(entity.id) || (name ? `name:${name}` : null)
        if (id && name && !target.has(id)) target.set(id, {id, name})
      }
    }
    for (const library of selected) {
      const types = library.type === 'movie' ? [1] : library.type === 'show' ? [4, 2] : [1, 4, 2]
      for (const type of types) {
        const payload = await request(`/library/sections/${encodeURIComponent(library.id)}/all?type=${type}`)
        for (const raw of array(record(payload.MediaContainer)?.Metadata).map(record).filter(Boolean) as JsonRecord[]) {
          if (type === 2) {
            const id = text(raw.ratingKey)
            const name = text(raw.title)
            if (id && name && !series.has(id)) series.set(id, {id, name})
            continue
          }
          collect(array(raw.Role).map(record).filter(Boolean) as JsonRecord[], people)
          collect(array(raw.Genre).map(record).filter(Boolean) as JsonRecord[], genres)
          const studio = text(raw.studio)
          if (studio && !studios.has(`name:${studio}`)) studios.set(`name:${studio}`, {id: `name:${studio}`, name: studio})
          const seriesId = text(raw.grandparentRatingKey)
          const seriesName = text(raw.grandparentTitle)
          if (seriesId && seriesName && !series.has(seriesId)) series.set(seriesId, {id: seriesId, name: seriesName})
          const item = parseItem(raw)
          if (item) items.push(item)
        }
      }
    }
    return {people: [...people.values()], genres: [...genres.values()], studios: [...studios.values()], series: [...series.values()], items}
  }

  return {listLibraries, loadLibrarySnapshot}
}
