import {API_ROUTES} from '@shared/api/routes'
import type {
  LibraryResetCounts,
  LibraryResetMediaPayload,
  LibraryResetStreamEvent,
  LibraryResetTagsPayload,
} from '@shared/api/payloads'
import {apiClient} from '../apiClient'
import {postApiNdjsonStream} from '../ndjsonStream'

export const libraryResetApi = {
  getLibraryResetCounts() {
    return apiClient.get<LibraryResetCounts>(API_ROUTES.libraryResetCounts)
  },

  resetLibraryMedia(
    body: LibraryResetMediaPayload,
    onEvent: (event: LibraryResetStreamEvent) => void,
    options: {signal?: AbortSignal} = {},
  ) {
    return postApiNdjsonStream<LibraryResetStreamEvent>(
      API_ROUTES.libraryResetMedia,
      {
        body,
        signal: options.signal,
        errorMessage: 'Library reset media failed',
      },
      onEvent,
    )
  },

  resetLibraryTags(
    body: LibraryResetTagsPayload,
    onEvent: (event: LibraryResetStreamEvent) => void,
    options: {signal?: AbortSignal} = {},
  ) {
    return postApiNdjsonStream<LibraryResetStreamEvent>(
      API_ROUTES.libraryResetTags,
      {
        body,
        signal: options.signal,
        errorMessage: 'Library reset tags failed',
      },
      onEvent,
    )
  },
}
