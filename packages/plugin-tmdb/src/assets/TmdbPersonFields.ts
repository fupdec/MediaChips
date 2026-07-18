/** Child meta keys for TMDB person/actor scraping (pinned under Cast category). */
const TmdbPersonFields = [
  {name: 'Birthday', type: 'date', key: 'tmdb_birthday'},
  {name: 'Deathday', type: 'date', key: 'tmdb_deathday'},
  {name: 'Place of birth', type: 'string', key: 'tmdb_place_of_birth'},
  {name: 'Known for', type: 'string', key: 'tmdb_known_for'},
  {name: 'Gender', type: 'array', key: 'tmdb_gender'},
]

export default TmdbPersonFields

export const TMDB_PERSON_SCRAPER_KEYS = [
  'tmdb_birthday',
  'tmdb_deathday',
  'tmdb_place_of_birth',
  'tmdb_known_for',
  'tmdb_gender',
] as const

export type TmdbPersonScraperKey = (typeof TMDB_PERSON_SCRAPER_KEYS)[number]
