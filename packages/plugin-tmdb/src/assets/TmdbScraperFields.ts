/** TMDB-specific scraper keys — do not reuse adult scene keys (performers/tags). */
const TmdbScraperFields = [
  {name: 'Release date', type: 'date', key: 'tmdb_release_date'},
  {name: 'Studio', type: 'array', key: 'tmdb_studio'},
  {name: 'Cast', type: 'array', key: 'tmdb_cast'},
  {name: 'Genres', type: 'array', key: 'tmdb_genres'},
]

export default TmdbScraperFields

export const TMDB_SCRAPER_KEYS = [
  'tmdb_release_date',
  'tmdb_studio',
  'tmdb_cast',
  'tmdb_genres',
] as const

export type TmdbScraperKey = (typeof TMDB_SCRAPER_KEYS)[number]
