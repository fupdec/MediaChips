import {apiClient} from '../apiClient'
import {
  API_ROUTES,
  apiTmdbFindImdb,
  apiTmdbMovie,
  apiTmdbPerson,
  apiTmdbTitle,
} from '@shared/api/routes'
import {
  parseTmdbExtrasResponse,
  parseTmdbPersonSearchResponse,
  parseTmdbSearchResponse,
  parseTmdbStatus,
} from '@shared/schemas'
import {validated} from './validate'

export type TmdbMediaKind = 'movie' | 'tv'

export const tmdbApi = {
  getTmdbStatus() {
    return apiClient.get(API_ROUTES.tmdbStatus).then((res) => ({
      ...res,
      data: validated(parseTmdbStatus, res.data),
    }))
  },

  searchTmdbMovies(body: {query: string; year?: string | number; limit?: number}) {
    return apiClient.post(API_ROUTES.tmdbSearch, body).then((res) => ({
      ...res,
      data: validated(parseTmdbSearchResponse, res.data),
    }))
  },

  getTmdbMovie(id: number | string) {
    return apiClient.get(apiTmdbMovie(id)).then((res) => ({
      ...res,
      data: validated(parseTmdbExtrasResponse, res.data),
    }))
  },

  getTmdbTitle(
    mediaType: TmdbMediaKind,
    id: number | string,
    options: {season?: number; episode?: number; hint?: string} = {},
  ) {
    return apiClient.get(apiTmdbTitle(mediaType, id), {
      params: {
        season: options.season,
        episode: options.episode,
        hint: options.hint,
      },
    }).then((res) => ({
      ...res,
      data: validated(parseTmdbExtrasResponse, res.data),
    }))
  },

  findTmdbByImdb(imdbId: string) {
    return apiClient.get(apiTmdbFindImdb(imdbId)).then((res) => ({
      ...res,
      data: validated(parseTmdbExtrasResponse, res.data),
    }))
  },

  searchTmdbPeople(body: {query: string; limit?: number}) {
    return apiClient.post(API_ROUTES.tmdbPersonSearch, body).then((res) => ({
      ...res,
      data: validated(parseTmdbPersonSearchResponse, res.data),
    }))
  },

  getTmdbPerson(id: number | string) {
    return apiClient.get(apiTmdbPerson(id)).then((res) => ({
      ...res,
      data: validated(parseTmdbExtrasResponse, res.data),
    }))
  },
}
