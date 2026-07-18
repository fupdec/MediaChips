import type {ApiDb} from '../../../../api/types/db'
import {isTmdbConfigured, resolveTmdbApiKey} from './tmdbApiKey'
import {
  findByImdbId,
  getMovie,
  getPerson,
  getTv,
  parseSeasonEpisode,
  personToExtras,
  searchPeople,
  searchTitles,
  titleToExtras,
  type TmdbMediaKind,
} from './tmdbClient'

export default function createTmdbController(db: ApiDb) {
  return {
    status(_req: unknown, res: {json: (body: unknown) => void}) {
      res.json({configured: isTmdbConfigured(db)})
    },

    async search(
      req: {body?: {query?: string; year?: string | number; limit?: string | number}},
      res: {
        status: (code: number) => {json: (body: unknown) => void}
        json: (body: unknown) => void
      },
    ) {
      const apiKey = resolveTmdbApiKey(db)
      if (!apiKey) {
        res.status(400).json({error: 'TMDB API key is not configured'})
        return
      }
      const query = String(req.body?.query || '').trim()
      if (!query) {
        res.status(400).json({error: 'query is required'})
        return
      }
      try {
        const results = await searchTitles(apiKey, query, {
          year: req.body?.year,
          limit: Number(req.body?.limit) || 20,
        })
        res.json({results})
      } catch (error) {
        res.status(400).json({error: error instanceof Error ? error.message : String(error)})
      }
    },

    async movie(
      req: {params?: {id?: string}},
      res: {
        status: (code: number) => {json: (body: unknown) => void}
        json: (body: unknown) => void
      },
    ) {
      const apiKey = resolveTmdbApiKey(db)
      if (!apiKey) {
        res.status(400).json({error: 'TMDB API key is not configured'})
        return
      }
      const id = String(req.params?.id || '').trim()
      if (!id) {
        res.status(400).json({error: 'id is required'})
        return
      }
      try {
        const movie = await getMovie(apiKey, id)
        res.json({movie, extras: titleToExtras(movie)})
      } catch (error) {
        res.status(400).json({error: error instanceof Error ? error.message : String(error)})
      }
    },

    async title(
      req: {
        params?: {mediaType?: string; id?: string}
        query?: {season?: string; episode?: string; hint?: string}
      },
      res: {
        status: (code: number) => {json: (body: unknown) => void}
        json: (body: unknown) => void
      },
    ) {
      const apiKey = resolveTmdbApiKey(db)
      if (!apiKey) {
        res.status(400).json({error: 'TMDB API key is not configured'})
        return
      }
      const mediaType = String(req.params?.mediaType || '').trim() as TmdbMediaKind
      const id = String(req.params?.id || '').trim()
      if (!id || (mediaType !== 'movie' && mediaType !== 'tv')) {
        res.status(400).json({error: 'mediaType and id are required'})
        return
      }

      try {
        if (mediaType === 'movie') {
          const movie = await getMovie(apiKey, id)
          res.json({movie, extras: titleToExtras(movie)})
          return
        }

        const fromQuerySeason = req.query?.season ? Number(req.query.season) : null
        const fromQueryEpisode = req.query?.episode ? Number(req.query.episode) : null
        const parsed = parseSeasonEpisode(String(req.query?.hint || ''))
        const season = fromQuerySeason || parsed?.season
        const episode = fromQueryEpisode || parsed?.episode

        const show = await getTv(apiKey, id, {
          season: season ?? undefined,
          episode: episode ?? undefined,
        })
        res.json({movie: show, extras: titleToExtras(show)})
      } catch (error) {
        res.status(400).json({error: error instanceof Error ? error.message : String(error)})
      }
    },

    async findImdb(
      req: {params?: {imdbId?: string}},
      res: {
        status: (code: number) => {json: (body: unknown) => void}
        json: (body: unknown) => void
      },
    ) {
      const apiKey = resolveTmdbApiKey(db)
      if (!apiKey) {
        res.status(400).json({error: 'TMDB API key is not configured'})
        return
      }
      const imdbId = String(req.params?.imdbId || '').trim()
      if (!imdbId) {
        res.status(400).json({error: 'imdbId is required'})
        return
      }
      try {
        const title = await findByImdbId(apiKey, imdbId)
        if (!title) {
          res.status(404).json({error: 'No TMDB title found for that IMDb id'})
          return
        }
        res.json({movie: title, extras: titleToExtras(title)})
      } catch (error) {
        res.status(400).json({error: error instanceof Error ? error.message : String(error)})
      }
    },

    async searchPeople(
      req: {body?: {query?: string; limit?: string | number}},
      res: {
        status: (code: number) => {json: (body: unknown) => void}
        json: (body: unknown) => void
      },
    ) {
      const apiKey = resolveTmdbApiKey(db)
      if (!apiKey) {
        res.status(400).json({error: 'TMDB API key is not configured'})
        return
      }
      const query = String(req.body?.query || '').trim()
      if (!query) {
        res.status(400).json({error: 'query is required'})
        return
      }
      try {
        const results = await searchPeople(apiKey, query, {
          limit: Number(req.body?.limit) || 20,
        })
        res.json({results})
      } catch (error) {
        res.status(400).json({error: error instanceof Error ? error.message : String(error)})
      }
    },

    async person(
      req: {params?: {id?: string}},
      res: {
        status: (code: number) => {json: (body: unknown) => void}
        json: (body: unknown) => void
      },
    ) {
      const apiKey = resolveTmdbApiKey(db)
      if (!apiKey) {
        res.status(400).json({error: 'TMDB API key is not configured'})
        return
      }
      const id = String(req.params?.id || '').trim()
      if (!id) {
        res.status(400).json({error: 'id is required'})
        return
      }
      try {
        const person = await getPerson(apiKey, id)
        res.json({person, extras: personToExtras(person)})
      } catch (error) {
        res.status(400).json({error: error instanceof Error ? error.message : String(error)})
      }
    },
  }
}
