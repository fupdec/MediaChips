import {apiClient} from '../apiClient'
import {API_ROUTES} from '@shared/api/routes'
import {parseMediaServerLibrariesResponse} from '@shared/schemas'
import {postApiNdjsonStream} from '../ndjsonStream'
import {validated} from './validate'

export type MediaServerKind = 'jellyfin' | 'plex' | 'emby'

export type MediaServerLibrary = {
  id: string
  name: string
}

export type MediaServerLibrariesResponse = {
  ok?: boolean
  libraries?: MediaServerLibrary[]
  error?: string
}

export type MediaServerAuth = {
  baseUrl: string
  apiKey?: string
  token?: string
}

export type MediaServerImportBody = MediaServerAuth & {
  libraryIds?: string[]
  createMissingMedia?: boolean
}

export type StashImportBody = {
  path: string
  createMissingMedia?: boolean
}

export type ImportStreamEvent = {
  type: string
  phase?: string
  processed?: number
  total?: number
  current?: string
  message?: string
  people?: number
  genres?: number
  studios?: number
  series?: number
  performers?: number
  tags?: number
  mediaCreated?: number
  mediaMatched?: number
  mediaUpdated?: number
  mediaSkipped?: number
  markers?: number
}

const MEDIA_SERVER_ROUTES: Record<MediaServerKind, {libraries: string; stream: string}> = {
  jellyfin: {
    libraries: API_ROUTES.jellyfinListLibraries,
    stream: API_ROUTES.jellyfinStreamImport,
  },
  plex: {
    libraries: API_ROUTES.plexListLibraries,
    stream: API_ROUTES.plexStreamImport,
  },
  emby: {
    libraries: API_ROUTES.embyListLibraries,
    stream: API_ROUTES.embyStreamImport,
  },
}

export const importsApi = {
  listMediaServerLibraries(kind: MediaServerKind, body: MediaServerAuth) {
    const route = MEDIA_SERVER_ROUTES[kind]
    return apiClient.post(route.libraries, body).then((res) => {
      const data = validated(parseMediaServerLibrariesResponse, res.data) as MediaServerLibrariesResponse
      if (data.ok === false) {
        throw new Error(data.error || `Failed to load ${kind} libraries`)
      }
      return {
        ...res,
        data: {
          ok: data.ok !== false,
          libraries: Array.isArray(data.libraries) ? data.libraries as MediaServerLibrary[] : [],
          error: data.error,
        },
      }
    })
  },

  streamMediaServerImport(
    kind: MediaServerKind,
    body: MediaServerImportBody,
    options: {signal?: AbortSignal},
    onEvent: (event: ImportStreamEvent) => void,
  ) {
    const route = MEDIA_SERVER_ROUTES[kind]
    return postApiNdjsonStream(
      route.stream,
      {
        body,
        signal: options.signal,
        errorMessage: `${kind} import failed`,
      },
      onEvent,
    )
  },

  streamStashImport(
    body: StashImportBody,
    options: {signal?: AbortSignal},
    onEvent: (event: ImportStreamEvent) => void,
  ) {
    return postApiNdjsonStream(
      API_ROUTES.stashStreamImport,
      {
        body,
        signal: options.signal,
        errorMessage: 'Stash import failed',
      },
      onEvent,
    )
  },
}
