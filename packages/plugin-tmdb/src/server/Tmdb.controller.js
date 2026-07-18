"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = createTmdbController;
const tmdbApiKey_1 = require("./tmdbApiKey");
const tmdbClient_1 = require("./tmdbClient");
function createTmdbController(db) {
    return {
        status(_req, res) {
            res.json({ configured: (0, tmdbApiKey_1.isTmdbConfigured)(db) });
        },
        async search(req, res) {
            const apiKey = (0, tmdbApiKey_1.resolveTmdbApiKey)(db);
            if (!apiKey) {
                res.status(400).json({ error: 'TMDB API key is not configured' });
                return;
            }
            const query = String(req.body?.query || '').trim();
            if (!query) {
                res.status(400).json({ error: 'query is required' });
                return;
            }
            try {
                const results = await (0, tmdbClient_1.searchTitles)(apiKey, query, {
                    year: req.body?.year,
                    limit: Number(req.body?.limit) || 20,
                });
                res.json({ results });
            }
            catch (error) {
                res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
            }
        },
        async movie(req, res) {
            const apiKey = (0, tmdbApiKey_1.resolveTmdbApiKey)(db);
            if (!apiKey) {
                res.status(400).json({ error: 'TMDB API key is not configured' });
                return;
            }
            const id = String(req.params?.id || '').trim();
            if (!id) {
                res.status(400).json({ error: 'id is required' });
                return;
            }
            try {
                const movie = await (0, tmdbClient_1.getMovie)(apiKey, id);
                res.json({ movie, extras: (0, tmdbClient_1.titleToExtras)(movie) });
            }
            catch (error) {
                res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
            }
        },
        async title(req, res) {
            const apiKey = (0, tmdbApiKey_1.resolveTmdbApiKey)(db);
            if (!apiKey) {
                res.status(400).json({ error: 'TMDB API key is not configured' });
                return;
            }
            const mediaType = String(req.params?.mediaType || '').trim();
            const id = String(req.params?.id || '').trim();
            if (!id || (mediaType !== 'movie' && mediaType !== 'tv')) {
                res.status(400).json({ error: 'mediaType and id are required' });
                return;
            }
            try {
                if (mediaType === 'movie') {
                    const movie = await (0, tmdbClient_1.getMovie)(apiKey, id);
                    res.json({ movie, extras: (0, tmdbClient_1.titleToExtras)(movie) });
                    return;
                }
                const fromQuerySeason = req.query?.season ? Number(req.query.season) : null;
                const fromQueryEpisode = req.query?.episode ? Number(req.query.episode) : null;
                const parsed = (0, tmdbClient_1.parseSeasonEpisode)(String(req.query?.hint || ''));
                const season = fromQuerySeason || parsed?.season;
                const episode = fromQueryEpisode || parsed?.episode;
                const show = await (0, tmdbClient_1.getTv)(apiKey, id, {
                    season: season ?? undefined,
                    episode: episode ?? undefined,
                });
                res.json({ movie: show, extras: (0, tmdbClient_1.titleToExtras)(show) });
            }
            catch (error) {
                res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
            }
        },
        async findImdb(req, res) {
            const apiKey = (0, tmdbApiKey_1.resolveTmdbApiKey)(db);
            if (!apiKey) {
                res.status(400).json({ error: 'TMDB API key is not configured' });
                return;
            }
            const imdbId = String(req.params?.imdbId || '').trim();
            if (!imdbId) {
                res.status(400).json({ error: 'imdbId is required' });
                return;
            }
            try {
                const title = await (0, tmdbClient_1.findByImdbId)(apiKey, imdbId);
                if (!title) {
                    res.status(404).json({ error: 'No TMDB title found for that IMDb id' });
                    return;
                }
                res.json({ movie: title, extras: (0, tmdbClient_1.titleToExtras)(title) });
            }
            catch (error) {
                res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
            }
        },
        async searchPeople(req, res) {
            const apiKey = (0, tmdbApiKey_1.resolveTmdbApiKey)(db);
            if (!apiKey) {
                res.status(400).json({ error: 'TMDB API key is not configured' });
                return;
            }
            const query = String(req.body?.query || '').trim();
            if (!query) {
                res.status(400).json({ error: 'query is required' });
                return;
            }
            try {
                const results = await (0, tmdbClient_1.searchPeople)(apiKey, query, {
                    limit: Number(req.body?.limit) || 20,
                });
                res.json({ results });
            }
            catch (error) {
                res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
            }
        },
        async person(req, res) {
            const apiKey = (0, tmdbApiKey_1.resolveTmdbApiKey)(db);
            if (!apiKey) {
                res.status(400).json({ error: 'TMDB API key is not configured' });
                return;
            }
            const id = String(req.params?.id || '').trim();
            if (!id) {
                res.status(400).json({ error: 'id is required' });
                return;
            }
            try {
                const person = await (0, tmdbClient_1.getPerson)(apiKey, id);
                res.json({ person, extras: (0, tmdbClient_1.personToExtras)(person) });
            }
            catch (error) {
                res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
            }
        },
    };
}
