import {typedApi} from '@/services/typedApi'
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
  const {data} = await typedApi.getTmdbStatus()
  return data
}

export async function searchTmdbMovies(payload: {
  query: string
  year?: string | number
  limit?: number
}): Promise<{results: TmdbSearchHit[]}> {
  const {data} = await typedApi.searchTmdbMovies(payload)
  return data as {results: TmdbSearchHit[]}
}

export async function getTmdbMovie(id: number | string): Promise<{extras: TmdbExtras}> {
  const {data} = await typedApi.getTmdbMovie(id)
  return data as unknown as {extras: TmdbExtras}
}

export async function getTmdbTitle(
  mediaType: TmdbMediaKind,
  id: number | string,
  options: {season?: number; episode?: number; hint?: string} = {},
): Promise<{extras: TmdbExtras}> {
  const {data} = await typedApi.getTmdbTitle(mediaType, id, options)
  return data as unknown as {extras: TmdbExtras}
}

export async function findTmdbByImdb(imdbId: string): Promise<{extras: TmdbExtras}> {
  const {data} = await typedApi.findTmdbByImdb(imdbId)
  return data as unknown as {extras: TmdbExtras}
}

export async function searchTmdbPeople(payload: {
  query: string
  limit?: number
}): Promise<{results: TmdbPersonSearchHit[]}> {
  const {data} = await typedApi.searchTmdbPeople(payload)
  return data as {results: TmdbPersonSearchHit[]}
}

export async function getTmdbPerson(id: number | string): Promise<{extras: TmdbPersonExtras}> {
  const {data} = await typedApi.getTmdbPerson(id)
  return data as unknown as {extras: TmdbPersonExtras}
}
