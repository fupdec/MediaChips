const TMDB_API_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/original'

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

export interface TmdbTitleDetails {
  id: number
  mediaType: TmdbMediaKind
  title: string
  originalTitle: string | null
  overview: string | null
  releaseDate: string | null
  runtime: number | null
  posterUrl: string | null
  backdropUrl: string | null
  imdbId: string | null
  studio: string | null
  genres: string[]
  cast: string[]
  directors: string[]
  seasonNumber?: number | null
  episodeNumber?: number | null
}

interface TmdbListItemApi {
  id: number
  media_type?: string
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  vote_average?: number
}

interface TmdbCreditsApi {
  cast?: Array<{name?: string; order?: number}>
  crew?: Array<{name?: string; job?: string}>
}

interface TmdbMovieApi {
  id: number
  title?: string
  original_title?: string
  overview?: string
  release_date?: string
  runtime?: number
  poster_path?: string | null
  backdrop_path?: string | null
  imdb_id?: string | null
  genres?: Array<{name?: string}>
  production_companies?: Array<{name?: string}>
  credits?: TmdbCreditsApi
}

interface TmdbTvApi {
  id: number
  name?: string
  original_name?: string
  overview?: string
  first_air_date?: string
  episode_run_time?: number[]
  poster_path?: string | null
  backdrop_path?: string | null
  genres?: Array<{name?: string}>
  networks?: Array<{name?: string}>
  production_companies?: Array<{name?: string}>
  credits?: TmdbCreditsApi
  external_ids?: {imdb_id?: string | null}
}

interface TmdbEpisodeApi {
  name?: string
  overview?: string
  air_date?: string
  runtime?: number | null
  still_path?: string | null
  season_number?: number
  episode_number?: number
  crew?: Array<{name?: string; job?: string}>
  guest_stars?: Array<{name?: string; order?: number}>
}

function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return `${TMDB_IMAGE_BASE}${path}`
}

async function tmdbFetch<T>(
  apiKey: string,
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(`${TMDB_API_BASE}${path}`)
  url.searchParams.set('api_key', apiKey)
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue
    url.searchParams.set(key, String(value))
  }

  const response = await fetch(url.toString(), {
    headers: {Accept: 'application/json'},
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`TMDB HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`)
  }
  return response.json() as Promise<T>
}

function mapCredits(credits?: TmdbCreditsApi): {cast: string[]; directors: string[]} {
  const cast = (credits?.cast || [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .map((person) => person.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, 20)

  const directors = (credits?.crew || [])
    .filter((person) => person.job === 'Director')
    .map((person) => person.name)
    .filter((name): name is string => Boolean(name))

  return {cast, directors}
}

function mapMovie(movie: TmdbMovieApi): TmdbTitleDetails {
  const {cast, directors} = mapCredits(movie.credits)
  return {
    id: movie.id,
    mediaType: 'movie',
    title: movie.title || movie.original_title || `TMDB ${movie.id}`,
    originalTitle: movie.original_title || null,
    overview: movie.overview || null,
    releaseDate: movie.release_date || null,
    runtime: movie.runtime ?? null,
    posterUrl: imageUrl(movie.poster_path),
    backdropUrl: imageUrl(movie.backdrop_path),
    imdbId: movie.imdb_id || null,
    studio: movie.production_companies?.[0]?.name || null,
    genres: (movie.genres || []).map((genre) => genre.name).filter((name): name is string => Boolean(name)),
    cast,
    directors,
  }
}

function mapTv(show: TmdbTvApi): TmdbTitleDetails {
  const {cast, directors} = mapCredits(show.credits)
  return {
    id: show.id,
    mediaType: 'tv',
    title: show.name || show.original_name || `TMDB ${show.id}`,
    originalTitle: show.original_name || null,
    overview: show.overview || null,
    releaseDate: show.first_air_date || null,
    runtime: show.episode_run_time?.[0] ?? null,
    posterUrl: imageUrl(show.poster_path),
    backdropUrl: imageUrl(show.backdrop_path),
    imdbId: show.external_ids?.imdb_id || null,
    studio: show.networks?.[0]?.name || show.production_companies?.[0]?.name || null,
    genres: (show.genres || []).map((genre) => genre.name).filter((name): name is string => Boolean(name)),
    cast,
    directors,
  }
}

function mapHit(item: TmdbListItemApi, mediaType: TmdbMediaKind): TmdbSearchHit {
  return {
    id: item.id,
    mediaType,
    title: item.title || item.name || item.original_title || item.original_name || `TMDB ${item.id}`,
    originalTitle: item.original_title || item.original_name || null,
    overview: item.overview || null,
    releaseDate: item.release_date || item.first_air_date || null,
    posterUrl: imageUrl(item.poster_path),
    voteAverage: typeof item.vote_average === 'number' ? item.vote_average : null,
  }
}

export function parseSeasonEpisode(text: string): {season: number; episode: number} | null {
  const match = String(text || '').match(/[Ss](\d{1,2})[Ee](\d{1,3})/)
  if (!match) return null
  return {season: Number(match[1]), episode: Number(match[2])}
}

export async function searchTitles(
  apiKey: string,
  query: string,
  options: {year?: number | string | null; limit?: number} = {},
): Promise<TmdbSearchHit[]> {
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 40)
  const year = options.year ?? undefined

  const [movies, shows] = await Promise.all([
    tmdbFetch<{results?: TmdbListItemApi[]}>(apiKey, '/search/movie', {
      query,
      year,
      include_adult: 'false',
    }),
    tmdbFetch<{results?: TmdbListItemApi[]}>(apiKey, '/search/tv', {
      query,
      first_air_date_year: year,
      include_adult: 'false',
    }),
  ])

  const hits = [
    ...(movies.results || []).map((item) => mapHit(item, 'movie')),
    ...(shows.results || []).map((item) => mapHit(item, 'tv')),
  ]

  hits.sort((a, b) => (b.voteAverage || 0) - (a.voteAverage || 0))
  return hits.slice(0, limit)
}

export async function getMovie(apiKey: string, tmdbId: number | string): Promise<TmdbTitleDetails> {
  const movie = await tmdbFetch<TmdbMovieApi>(apiKey, `/movie/${tmdbId}`, {
    append_to_response: 'credits',
  })
  return mapMovie(movie)
}

export async function getTv(
  apiKey: string,
  tmdbId: number | string,
  options: {season?: number; episode?: number} = {},
): Promise<TmdbTitleDetails> {
  const show = await tmdbFetch<TmdbTvApi>(apiKey, `/tv/${tmdbId}`, {
    append_to_response: 'credits,external_ids',
  })
  const base = mapTv(show)

  if (options.season == null || options.episode == null) {
    return base
  }

  try {
    const episode = await tmdbFetch<TmdbEpisodeApi>(
      apiKey,
      `/tv/${tmdbId}/season/${options.season}/episode/${options.episode}`,
    )
    const guestCast = (episode.guest_stars || [])
      .map((person) => person.name)
      .filter((name): name is string => Boolean(name))
    const directors = (episode.crew || [])
      .filter((person) => person.job === 'Director')
      .map((person) => person.name)
      .filter((name): name is string => Boolean(name))

    const episodeTitle = episode.name?.trim()
    return {
      ...base,
      title: episodeTitle
        ? `${base.title} S${String(options.season).padStart(2, '0')}E${String(options.episode).padStart(2, '0')} — ${episodeTitle}`
        : `${base.title} S${String(options.season).padStart(2, '0')}E${String(options.episode).padStart(2, '0')}`,
      overview: episode.overview || base.overview,
      releaseDate: episode.air_date || base.releaseDate,
      runtime: episode.runtime ?? base.runtime,
      posterUrl: imageUrl(episode.still_path) || base.posterUrl,
      cast: guestCast.length ? [...guestCast, ...base.cast].slice(0, 20) : base.cast,
      directors: directors.length ? directors : base.directors,
      seasonNumber: options.season,
      episodeNumber: options.episode,
    }
  } catch {
    return {
      ...base,
      title: `${base.title} S${String(options.season).padStart(2, '0')}E${String(options.episode).padStart(2, '0')}`,
      seasonNumber: options.season,
      episodeNumber: options.episode,
    }
  }
}

export async function findByImdbId(apiKey: string, imdbId: string): Promise<TmdbTitleDetails | null> {
  const normalized = imdbId.trim().startsWith('tt') ? imdbId.trim() : `tt${imdbId.trim()}`
  const data = await tmdbFetch<{
    movie_results?: Array<{id: number}>
    tv_results?: Array<{id: number}>
  }>(
    apiKey,
    `/find/${encodeURIComponent(normalized)}`,
    {external_source: 'imdb_id'},
  )

  const movieId = data.movie_results?.[0]?.id
  if (movieId) return getMovie(apiKey, movieId)

  const tvId = data.tv_results?.[0]?.id
  if (tvId) return getTv(apiKey, tvId)

  return null
}

export interface TmdbPersonSearchHit {
  id: number
  name: string
  originalName: string | null
  knownForDepartment: string | null
  profileUrl: string | null
  popularity: number | null
}

export interface TmdbPersonDetails {
  id: number
  name: string
  alsoKnownAs: string[]
  biography: string | null
  birthday: string | null
  deathday: string | null
  placeOfBirth: string | null
  knownForDepartment: string | null
  gender: string | null
  profileUrl: string | null
  imdbId: string | null
  homepage: string | null
}

interface TmdbPersonListItemApi {
  id: number
  name?: string
  original_name?: string
  known_for_department?: string
  profile_path?: string | null
  popularity?: number
}

interface TmdbPersonApi {
  id: number
  name?: string
  also_known_as?: string[]
  biography?: string
  birthday?: string | null
  deathday?: string | null
  place_of_birth?: string | null
  known_for_department?: string | null
  gender?: number
  profile_path?: string | null
  homepage?: string | null
  external_ids?: {imdb_id?: string | null}
}

const TMDB_GENDER_LABEL: Record<number, string> = {
  1: 'Female',
  2: 'Male',
  3: 'Non-binary',
}

function mapPersonGender(gender?: number): string | null {
  if (gender == null || gender === 0) return null
  return TMDB_GENDER_LABEL[gender] || null
}

function mapPersonHit(item: TmdbPersonListItemApi): TmdbPersonSearchHit {
  return {
    id: item.id,
    name: item.name || item.original_name || `Person ${item.id}`,
    originalName: item.original_name || null,
    knownForDepartment: item.known_for_department || null,
    profileUrl: imageUrl(item.profile_path),
    popularity: item.popularity ?? null,
  }
}

function mapPersonDetails(person: TmdbPersonApi): TmdbPersonDetails {
  return {
    id: person.id,
    name: person.name || `Person ${person.id}`,
    alsoKnownAs: (person.also_known_as || []).map((name) => String(name).trim()).filter(Boolean),
    biography: person.biography?.trim() || null,
    birthday: person.birthday || null,
    deathday: person.deathday || null,
    placeOfBirth: person.place_of_birth || null,
    knownForDepartment: person.known_for_department || null,
    gender: mapPersonGender(person.gender),
    profileUrl: imageUrl(person.profile_path),
    imdbId: person.external_ids?.imdb_id || null,
    homepage: person.homepage || null,
  }
}

export async function searchPeople(
  apiKey: string,
  query: string,
  {limit = 20}: {limit?: number} = {},
): Promise<TmdbPersonSearchHit[]> {
  const data = await tmdbFetch<{results?: TmdbPersonListItemApi[]}>(
    apiKey,
    '/search/person',
    {query},
  )
  return (data.results || []).slice(0, limit).map(mapPersonHit)
}

export async function getPerson(apiKey: string, id: string | number): Promise<TmdbPersonDetails> {
  const person = await tmdbFetch<TmdbPersonApi>(apiKey, `/person/${id}`, {
    append_to_response: 'external_ids',
  })
  return mapPersonDetails(person)
}

export function personToExtras(person: TmdbPersonDetails) {
  return {
    name: person.name,
    synonyms: person.alsoKnownAs.join(', ') || null,
    bio: person.biography,
    birthday: person.birthday,
    deathday: person.deathday,
    place_of_birth: person.placeOfBirth,
    known_for: person.knownForDepartment,
    gender: person.gender,
    image: person.profileUrl,
    tmdbId: person.id,
    imdbId: person.imdbId,
  }
}

export function titleToExtras(title: TmdbTitleDetails) {
  return {
    title: title.title,
    release_date: title.releaseDate,
    details: title.overview,
    studio: title.studio,
    cast: title.cast,
    genres: title.genres,
    image: title.posterUrl,
    tmdbId: title.id,
    imdbId: title.imdbId,
    directors: title.directors,
    mediaType: title.mediaType,
  }
}

/** @deprecated use titleToExtras */
export const movieToExtras = titleToExtras
