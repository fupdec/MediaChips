import {apiClient} from '@/services/apiClient'
import {API_ROUTES} from '@shared/api/routes'
import type {TmdbExtras} from './tmdbApply'
import type {TmdbPersonExtras} from './tmdbPersonApply'

export type TmdbMediaKind = 'movie' | 'tv'

export interface TmdbSearchHit {
  id: number
  mediaType: TmdbMediaKind
  title: string
  originalTitle: string | null
  overview: string | null
  releaseDate: string | null
  posterUrl: string | null
  voteAverage: number | null
}

export interface TmdbPersonSearchHit {
  id: number
  name: string
  originalName: string | null
  knownForDepartment: string | null
  profileUrl: string | null
  popularity: number | null
}

export async function getTmdbStatus(): Promise<{configured: boolean}> {
  const response = await apiClient.get(API_ROUTES.tmdbStatus)
  return response.data
}

export async function searchTmdbMovies(payload: {
  query: string
  year?: string | number
  limit?: number
}): Promise<{results: TmdbSearchHit[]}> {
  const response = await apiClient.post(API_ROUTES.tmdbSearch, payload)
  return response.data
}

export async function getTmdbMovie(id: number | string): Promise<{extras: TmdbExtras}> {
  const response = await apiClient.get(`${API_ROUTES.tmdbMovie}/${id}`)
  return response.data
}

export async function getTmdbTitle(
  mediaType: TmdbMediaKind,
  id: number | string,
  options: {season?: number; episode?: number; hint?: string} = {},
): Promise<{extras: TmdbExtras}> {
  const response = await apiClient.get(`${API_ROUTES.tmdbTitle}/${mediaType}/${id}`, {
    params: {
      season: options.season,
      episode: options.episode,
      hint: options.hint,
    },
  })
  return response.data
}

export async function findTmdbByImdb(imdbId: string): Promise<{extras: TmdbExtras}> {
  const response = await apiClient.get(`${API_ROUTES.tmdbFindImdb}/${encodeURIComponent(imdbId)}`)
  return response.data
}

export async function searchTmdbPeople(payload: {
  query: string
  limit?: number
}): Promise<{results: TmdbPersonSearchHit[]}> {
  const response = await apiClient.post(API_ROUTES.tmdbPersonSearch, payload)
  return response.data
}

export async function getTmdbPerson(id: number | string): Promise<{extras: TmdbPersonExtras}> {
  const response = await apiClient.get(`${API_ROUTES.tmdbPerson}/${id}`)
  return response.data
}
